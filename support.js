import { sparqlEscapeString, sparqlEscapeUri } from 'mu';
import { querySudo as query } from './auth-sudo';
import moment from 'moment';

const fileDownloadPrefix = process.env.FILE_DOWNLOAD_PREFIX || 'localhost';

/**
 * Convert results of select query to an array of objects.
 * @method parseResult
 * @return {Array}
 */
const parseResult = function(result) {
  const bindingKeys = result.head.vars;
  return result.results.bindings.map((row) => {
    const obj = {};
    try {
      bindingKeys.forEach((key) => obj[key] = row[key].value);
    } catch(e) {
      console.log(`Error when parsing fetched form ${row.complaintForm.value}: ${e.message}`)
    }
    return obj;
  });
};

/**
 * Retrieve forms wating to be converted to emails
 */
const fetchFormsToBeConverted = async function(complaintFormGraph) {
  const result = await query(`
    PREFIX nmo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nmo#>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX schema: <http://schema.org/>
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

    SELECT ?complaintForm ?uuid ?name ?contactPersonName ?street ?houseNumber ?addressComplement ?locality ?postalCode ?telephone ?senderEmail ?content ?created
    WHERE {
        GRAPH ${sparqlEscapeUri(complaintFormGraph)} {
          ?complaintForm a ext:ComplaintForm;
              <http://mu.semte.ch/vocabularies/core/uuid> ?uuid;
              foaf:name ?name;
              schema:streetAddress ?street;
              schema:postOfficeBoxNumber ?houseNumber;
              schema:addressLocality ?locality;
              schema:postalCode ?postalCode;
              schema:email ?senderEmail;
              ext:content ?content;
              dct:created ?created.

          BIND('-' as ?defaultContactPersonName).
          OPTIONAL { ?complaintForm ext:personName ?optionalContactPersonName }.
          BIND(coalesce(?optionalContactPersonName, ?defaultContactPersonName) as ?contactPersonName).

          BIND('-' as ?defaultAddressComplement).
          OPTIONAL { ?complaintForm ext:addressComplement ?optionalAddressComplement }.
          BIND(coalesce(?optionalAddressComplement, ?defaultAddressComplement) as ?addressComplement).

          BIND('-' as ?defaultTelephone).
          OPTIONAL { ?complaintForm schema:telephone ?optionalTelephone }.
          BIND(coalesce(?optionalTelephone, ?defaultTelephone) as ?telephone).

          FILTER NOT EXISTS {{ ?complaintForm ext:isConvertedIntoEmail ?email. }}
        }
    }
  `);
  return parseResult(result);
};

/**
 * Retrieve the attachments of a form
 */
const fetchFormAttachments = async function(complaintFormGraph, fileGraph, formUuid) {
  const result = await query(`
    PREFIX nmo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nmo#>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX schema: <http://schema.org/>
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>
    PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
    PREFIX dcterms: <http://purl.org/dc/terms/>

    SELECT ?file ?uuid ?filename ?format ?size
    WHERE {
        GRAPH ${sparqlEscapeUri(complaintFormGraph)} {
          ?complaintForm a ext:ComplaintForm;
              <http://mu.semte.ch/vocabularies/core/uuid> ${sparqlEscapeString(formUuid)};
              nmo:hasAttachment ?attachment.
        }
        GRAPH <${fileGraph}> {
            ?attachment nfo:fileName ?filename;
                  <http://mu.semte.ch/vocabularies/core/uuid> ?uuid.
            ?file nie:dataSource ?attachment;
                  dcterms:format ?format;
                  nfo:fileSize ?size.
        }
    }
  `);
  return parseResult(result);
};

const humanReadableSize = function(size) {
  const bytes = size;
  const sizes = ['bytes', 'KB', 'MB', 'GB', 'TB'];
  if (bytes == 0) return '0 byte';
  const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
  return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
};

const createSenderEmail = function(form, attachments, fromAddress) {
  const uuidv4 = require('uuid/v4');

  let senderName = form.name
  if(form.contactPersonName != '-') {
    senderName = form.name;
  }

  const subject = 'Uw klacht over de werking van een lokaal bestuur.';

  var attachmentsHtml = '';
  var attachmentsPlainText = '';
  attachments.map((attachment) => {
    const downloadLink = `${fileDownloadPrefix}/files/${attachment.uuid}/download?name=${attachment.filename}`;
    const formattedAttachment = `${attachment.filename} (${humanReadableSize(attachment.size)})`;
    attachmentsHtml += `<li><a href="${downloadLink}" target="_blank">${formattedAttachment}</a></li>\n\t`;
    attachmentsPlainText += `${formattedAttachment} (${downloadLink})\n\t`;
  });

  const plainTextContent = `
  Geachte ${senderName}
  Het Agentschap Binnenlands Bestuur Vlaanderen heeft uw klacht goed ontvangen:

  Beveiligd verzonden: ${senderName}, ${moment(form.created).format("DD/MM/YY HH:mm")}
  Ontvangen: Agentschap Binnenlands Bestuur, ${moment().format("DD/MM/YY HH:mm")}
  Naam: ${senderName}
  Contactpersoon indien vereniging: ${form.contactPersonName}
  Straat: ${form.street}
  Huisnummer: ${form.houseNumber}
  Toevoeging: ${form.addressComplement}
  Postcode: ${form.postalCode}
  Gemeente of Stad: ${form.locality}
  Telefoonnummer: ${form.telephone}
  Mailadres: ${form.senderEmail}

  Omschrijving klacht:
  ${form.content}

  Bijlagen

  ${attachmentsPlainText}

  ABB zal binnen een termijn van 10 werkdagen antwoorden. Uw gegevens worden niet gedeeld met derden, en worden in alle discretie verwerkt om deze klacht aan te pakken.
  Hoogachtend
  ABB Vlaanderen
  `;

  const htmlContent = `
  <p>Geachte ${senderName}</p><br>
  <p>Het Agentschap Binnenlands Bestuur Vlaanderen heeft uw klacht goed ontvangen:</p><br>
  <div style="margin-left: 40px;">
    <p><span style="font-weight:bold;">Beveiligd verzonden:&nbsp;</span><span>${senderName}, ${moment(form.created).format("DD/MM/YY HH:mm")}</span></p>
    <p><span style="font-weight:bold;">Ontvangen:&nbsp;</span><span>Agentschap Binnenlands Bestuur, ${moment().format("DD/MM/YY HH:mm")}</span></p><br><br>
    <p><span style="font-weight:bold;">Naam:&nbsp;</span><span>${senderName}</span></p>
    <p><span style="font-weight:bold;">Contactpersoon indien vereniging:&nbsp;</span><span>${form.contactPersonName}</span></p><br>
    <p><span style="font-weight:bold;">Straat:&nbsp;</span><span>${form.street}</span></p>
    <p><span style="font-weight:bold;">Huisnummer:&nbsp;</span><span>${form.houseNumber}</span></p>
    <p><span style="font-weight:bold;">Toevoeging:&nbsp;</span><span>${form.addressComplement}</span></p>
    <p><span style="font-weight:bold;">Postcode:&nbsp;</span><span>${form.postalCode}</span></p>
    <p><span style="font-weight:bold;">Gemeente of Stad:&nbsp;</span><span>${form.locality}</span></p><br>
    <p><span style="font-weight:bold;">Telefoonnummer:&nbsp;</span><span>${form.telephone}</span></p>
    <p><span style="font-weight:bold;">Mailadres:&nbsp;</span><span>${form.senderEmail}</span></p><br>
    <p style="font-weight:bold;">Omschrijving klacht:</p>
    <div style="margin-left: 40px;">
      ${form.content}
    </div><br>
    <p style="font-weight:bold;">Bijlagen</p>

    <ul>
      ${attachmentsHtml}
    </ul>
  </div><br>
  <p>ABB zal binnen een termijn van 10 werkdagen antwoorden. Uw gegevens worden niet gedeeld met derden, en worden in alle discretie verwerkt om deze klacht aan te pakken.</p><br>
  <p>Hoogachtend</p>
  <p>ABB Vlaanderen</p>
  `;

  const email = {
    uuid: uuidv4(),
    from: fromAddress,
    to: form.senderEmail,
    subject: subject,
    plainTextContent: plainTextContent,
    htmlContent: htmlContent
  };

  return email;
};

const createReceiverEmail = function(form, attachments, fromAddress, toAddress) {
  const uuidv4 = require('uuid/v4');

  let senderName = form.name
  if(form.contactPersonName != '-') {
    senderName = form.name;
  }

  const subject = `Klacht van ${senderName} over de werking van een lokaal bestuur`;

  var attachmentsHtml = '';
  var attachmentsPlainText = '';
  attachments.map((attachment) => {
    const downloadLink = `${fileDownloadPrefix}/files/${attachment.uuid}/download?name=${attachment.filename}`;
    const formattedAttachment = `${attachment.filename} (${humanReadableSize(attachment.size)})`;
    attachmentsHtml += `<li><a href="${downloadLink}" target="_blank">${formattedAttachment}</a></li>\n\t`;
    attachmentsPlainText += `${formattedAttachment} (${downloadLink})\n\t`;
  });

  const plainTextContent = `
  Geachte
  Er werd een klacht ingediend bij het Agentschap Binnenlands Bestuur via het Digitaal Klachtenformulier. Hieronder vindt u de inhoud van de klacht en de gegevens van klager

    Beveiligd verzonden: ${senderName}, ${moment(form.created).format("DD/MM/YY HH:mm")}
    Ontvangen: Agentschap Binnenlands Bestuur, ${moment().format("DD/MM/YY HH:mm")}
    Naam: ${form.name}
    Contactpersoon indien vereniging: ${form.contactPersonName}
    Straat: ${form.street}
    Huisnummer: ${form.houseNumber}
    Toevoeging: ${form.addressComplement}
    Postcode: ${form.postalCode}
    Gemeente of Stad: ${form.locality}
    Telefoonnummer: ${form.telephone}
    Mailadres: ${form.senderEmail}
    Omschrijving klacht:

      ${form.content}

    Bijlagen

    ${attachmentsPlainText}

  De afzender heeft een bevestigingsmail gekregen, waarin vermeld staat dat ABB binnen een termijn van 10 werkdagen zal antwoorden.
  Hoogachtend
  ABB Vlaanderen
  `;

  const htmlContent = `
  <p>Geachte</p><br>
  <p>Er werd een klacht ingediend bij het Agentschap Binnenlands Bestuur via het Digitaal Klachtenformulier. Hieronder vindt u de inhoud van de klacht en de gegevens van klager</p><br>
  <div style="margin-left: 40px;">
    <p><span style="font-weight:bold;">Beveiligd verzonden:&nbsp;</span><span>${senderName}, ${moment(form.created).format("DD/MM/YY HH:mm")}</span></p>
    <p><span style="font-weight:bold;">Ontvangen:&nbsp;</span><span>Agentschap Binnenlands Bestuur, ${moment().format("DD/MM/YY HH:mm")}</span></p><br><br>
    <p><span style="font-weight:bold;">Naam:&nbsp;</span><span>${form.name}</span></p>
    <p><span style="font-weight:bold;">Contactpersoon indien vereniging:&nbsp;</span><span>${form.contactPersonName}</span></p><br>
    <p><span style="font-weight:bold;">Straat:&nbsp;</span><span>${form.street}</span></p>
    <p><span style="font-weight:bold;">Huisnummer:&nbsp;</span><span>${form.houseNumber}</span></p>
    <p><span style="font-weight:bold;">Toevoeging:&nbsp;</span><span>${form.addressComplement}</span></p>
    <p><span style="font-weight:bold;">Postcode:&nbsp;</span><span>${form.postalCode}</span></p>
    <p><span style="font-weight:bold;">Gemeente of Stad:&nbsp;</span><span>${form.locality}</span></p><br>
    <p><span style="font-weight:bold;">Telefoonnummer:&nbsp;</span><span>${form.telephone}</span></p>
    <p><span style="font-weight:bold;">Mailadres:&nbsp;</span><span>${form.senderEmail}</span></p><br>
    <p style="font-weight:bold;">Omschrijving klacht:</p>
    <div style="margin-left: 40px;">
      ${form.content}
    </div><br>

    <p style="font-weight:bold;">Bijlagen</p>
    <ul>
      ${attachmentsHtml}
    </ul>
  </div><br>
  <p>De afzender heeft een bevestigingsmail gekregen, waarin vermeld staat dat ABB binnen een termijn van 10 werkdagen zal antwoorden.</p><br>
  <p>Hoogachtend</p>
  <p>ABB Vlaanderen</p>
  `;

  const email = {
    uuid: uuidv4(),
    from: fromAddress,
    to: toAddress,
    subject: subject,
    plainTextContent: plainTextContent,
    htmlContent: htmlContent
  };

  return email;
};

/**
 * Set emails to mailbox
 */
const setEmailToMailbox = async function(email, emailGraph, mailbox) {
  const result = await query(`
    PREFIX nmo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nmo#>
    PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/03/22/nie#>
    PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>

    INSERT {
       GRAPH ${sparqlEscapeUri(emailGraph)} {
           ?email a nmo:Email;
               <http://mu.semte.ch/vocabularies/core/uuid> "${(email.uuid)}";
               nmo:messageFrom "${(email.from)}";
               nmo:emailTo "${(email.to)}";
               nmo:messageSubject "${(email.subject)}";
               nmo:plainTextMessageContent """${(email.plainTextContent)}""";
               nmo:htmlMessageContent """${(email.htmlContent)}""";
               nmo:sentDate "${moment().format()}";
               nmo:isPartOf ?mailfolder.
        }
    }
    WHERE {
      GRAPH ${sparqlEscapeUri(emailGraph)} {
            ?mailfolder a nfo:Folder;
                nie:title  ${sparqlEscapeString(mailbox)}.
            BIND(IRI(CONCAT("http://data.lblod.info/id/emails/", "${(email.uuid)}")) AS ?email)
        }
    }
  `);
};

/**
 * Set the form as converted to avoid re-converting it indefinitely
 */
const setFormAsConverted = async function(complaintFormGraph, emailGraph, formUuid, emailUuid) {
  const result = await query(`
    PREFIX schema: <http://schema.org/>
    PREFIX nmo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nmo#>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

    INSERT {
        GRAPH ${sparqlEscapeUri(complaintFormGraph)} {
            ?form ext:isConvertedIntoEmail ?email.
        }
    }
    WHERE {
        GRAPH ${sparqlEscapeUri(emailGraph)} {
            ?email a nmo:Email;
               <http://mu.semte.ch/vocabularies/core/uuid> ${sparqlEscapeString(emailUuid)}.
        }
        GRAPH ${sparqlEscapeUri(complaintFormGraph)} {
            ?form a ext:ComplaintForm;
                <http://mu.semte.ch/vocabularies/core/uuid> ${sparqlEscapeString(formUuid)}.
        }
    }
  `);
}

export {
  fetchFormsToBeConverted,
  fetchFormAttachments,
  createSenderEmail,
  createReceiverEmail,
  setEmailToMailbox,
  setFormAsConverted
};
