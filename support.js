import * as mas from '@lblod/mu-auth-sudo';
import * as mu from 'mu';
import { v4 as uuid } from 'uuid';
import {
  senderEmailSubject,
  senderEmailPlainTextContent,
  senderEmailHtmlContent,
} from './templates/senderEmail';
import {
  receiverEmailSubject,
  receiverEmailPlainTextContent,
  receiverEmailHtmlContent,
} from './templates/receiverEmail';

/**
 * Convert results of select query to an array of objects.
 * @method parseResult
 * @return {Array}
 */
function parseResult(result) {
  const bindingKeys = result.head.vars;
  return result.results.bindings.map((row) => {
    const obj = {};
    try {
      bindingKeys.forEach((key) => (obj[key] = row[key].value));
    } catch (e) {
      console.log(
        `Error when parsing fetched form ${row.complaintForm.value}: ${e.message}`,
      );
    }
    return obj;
  });
}

/**
 * Retrieve forms wating to be converted to emails
 */
export async function fetchFormsToBeConverted(complaintFormGraph) {
  const result = await mas.querySudo(`
    PREFIX nmo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nmo#>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX schema: <http://schema.org/>
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX core: <http://mu.semte.ch/vocabularies/core/>

    SELECT ?complaintForm ?uuid ?name ?contactPersonName ?street ?houseNumber ?addressComplement ?locality ?postalCode ?telephone ?senderEmail ?content ?created
    WHERE {
      GRAPH ${mu.sparqlEscapeUri(complaintFormGraph)} {
        ?complaintForm
          a ext:ComplaintForm ;
          core:uuid ?uuid ;
          foaf:name ?name ;
          schema:streetAddress ?street ;
          schema:postOfficeBoxNumber ?houseNumber ;
          schema:addressLocality ?locality ;
          schema:postalCode ?postalCode ;
          schema:email ?senderEmail ;
          ext:content ?content ;
          dct:created ?created .

        BIND('-' as ?defaultContactPersonName)
        OPTIONAL { ?complaintForm ext:personName ?optionalContactPersonName . }
        BIND(
          coalesce(
            ?optionalContactPersonName,
            ?defaultContactPersonName)
          as ?contactPersonName)

        BIND('-' as ?defaultAddressComplement).
        OPTIONAL { ?complaintForm ext:addressComplement ?optionalAddressComplement . }
        BIND(
          coalesce(
            ?optionalAddressComplement,
            ?defaultAddressComplement)
          as ?addressComplement).

        BIND('-' as ?defaultTelephone).
        OPTIONAL { ?complaintForm schema:telephone ?optionalTelephone . }
        BIND(coalesce(?optionalTelephone, ?defaultTelephone) as ?telephone)

        FILTER NOT EXISTS { ?complaintForm ext:isConvertedIntoEmail ?email . }
      }
    }
  `);
  return parseResult(result);
}

/**
 * Retrieve the attachments of a form
 */
export async function fetchFormAttachments(
  complaintFormGraph,
  fileGraph,
  formUuid,
) {
  const result = await mas.querySudo(`
    PREFIX nmo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nmo#>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX schema: <http://schema.org/>
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>
    PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
    PREFIX dcterms: <http://purl.org/dc/terms/>
    PREFIX core: <http://mu.semte.ch/vocabularies/core/>

    SELECT ?file ?uuid ?filename ?format ?size
    WHERE {
      GRAPH ${mu.sparqlEscapeUri(complaintFormGraph)} {
        ?complaintForm
          a ext:ComplaintForm ;
          core:uuid ${mu.sparqlEscapeString(formUuid)} ;
          nmo:hasAttachment ?attachment .
      }
      GRAPH <${fileGraph}> {
        ?attachment
          nfo:fileName ?filename ;
          core:uuid ?uuid .
        ?file
          nie:dataSource ?attachment ;
          dcterms:format ?format ;
          nfo:fileSize ?size .
      }
    }
  `);
  return parseResult(result);
}

export function createSenderEmail(form, attachments, fromAddress) {
  const email = {
    uuid: uuid(),
    from: fromAddress,
    to: form.senderEmail,
    subject: senderEmailSubject(),
    plainTextContent: senderEmailPlainTextContent(form, attachments),
    htmlContent: senderEmailHtmlContent(form, attachments),
  };

  return email;
}

export function createReceiverEmail(form, attachments, fromAddress, toAddress) {
  const email = {
    uuid: uuid(),
    from: fromAddress,
    to: toAddress,
    subject: receiverEmailSubject(form),
    plainTextContent: receiverEmailPlainTextContent(form, attachments),
    htmlContent: receiverEmailHtmlContent(form, attachments),
  };

  return email;
}

/**
 * Set emails to mailbox
 */
export async function setEmailToMailbox(email, emailGraph, mailbox) {
  const sendDate = new Date();
  await mas.querySudo(`
    PREFIX nmo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nmo#>
    PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>
    PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
    PREFIX core: <http://mu.semte.ch/vocabularies/core/>

    INSERT {
      GRAPH ${mu.sparqlEscapeUri(emailGraph)} {
        ?email
          a nmo:Email ;
          core:uuid "${email.uuid}" ;
          nmo:messageFrom "${email.from}" ;
          nmo:emailTo "${email.to}" ;
          nmo:messageSubject "${email.subject}" ;
          nmo:plainTextMessageContent """${email.plainTextContent}""" ;
          nmo:htmlMessageContent """${email.htmlContent}""" ;
          nmo:sentDate "${mu.sparqlEscapeDateTime(sendDate)}" ;
          nmo:isPartOf ?mailfolder .
      }
    }
    WHERE {
      GRAPH ${mu.sparqlEscapeUri(emailGraph)} {
        ?mailfolder
          a nfo:Folder ;
          nie:title ${mu.sparqlEscapeString(mailbox)} .
        BIND(
          IRI(CONCAT(
            "http://data.lblod.info/id/emails/",
            "${email.uuid}"))
          AS ?email)
        }
    }
  `);
}

/**
 * Set the form as converted to avoid re-converting it indefinitely
 */
export async function setFormAsConverted(
  complaintFormGraph,
  emailGraph,
  formUuid,
  emailUuid,
) {
  await mas.querySudo(`
    PREFIX schema: <http://schema.org/>
    PREFIX nmo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nmo#>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX core: <http://mu.semte.ch/vocabularies/core/>

    INSERT {
      GRAPH ${mu.sparqlEscapeUri(complaintFormGraph)} {
        ?form ext:isConvertedIntoEmail ?email .
      }
    }
    WHERE {
      GRAPH ${mu.sparqlEscapeUri(emailGraph)} {
        ?email
          a nmo:Email ;
          core:uuid ${mu.sparqlEscapeString(emailUuid)} .
      }
      GRAPH ${mu.sparqlEscapeUri(complaintFormGraph)} {
        ?form
          a ext:ComplaintForm ;
          core:uuid ${mu.sparqlEscapeString(formUuid)} .
      }
    }
  `);
}
