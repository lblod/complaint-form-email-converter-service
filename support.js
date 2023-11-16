import { sparqlEscapeString, sparqlEscapeUri } from 'mu';
import * as mas from '@lblod/mu-auth-sudo';
import moment from 'moment';
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
const parseResult = function (result) {
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
};

/**
 * Retrieve forms wating to be converted to emails
 */
export const fetchFormsToBeConverted = async function (complaintFormGraph) {
  const result = await mas.querySudo(`
    PREFIX nmo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nmo#>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX schema: <http://schema.org/>
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX core: <http://mu.semte.ch/vocabularies/core/>

    SELECT ?complaintForm ?uuid ?name ?contactPersonName ?street ?houseNumber ?addressComplement ?locality ?postalCode ?telephone ?senderEmail ?content ?created
    WHERE {
      GRAPH ${sparqlEscapeUri(complaintFormGraph)} {
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
};

/**
 * Retrieve the attachments of a form
 */
export const fetchFormAttachments = async function (
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
      GRAPH ${sparqlEscapeUri(complaintFormGraph)} {
        ?complaintForm
          a ext:ComplaintForm ;
          core:uuid ${sparqlEscapeString(formUuid)} ;
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
};

export const createSenderEmail = function (form, attachments, fromAddress) {
  const uuidv4 = require('uuid/v4');

  const email = {
    uuid: uuidv4(),
    from: fromAddress,
    to: form.senderEmail,
    subject: senderEmailSubject(),
    plainTextContent: senderEmailPlainTextContent(form, attachments),
    htmlContent: senderEmailHtmlContent(form, attachments),
  };

  return email;
};

export const createReceiverEmail = function (
  form,
  attachments,
  fromAddress,
  toAddress,
) {
  const uuidv4 = require('uuid/v4');

  const email = {
    uuid: uuidv4(),
    from: fromAddress,
    to: toAddress,
    subject: receiverEmailSubject(form),
    plainTextContent: receiverEmailPlainTextContent(form, attachments),
    htmlContent: receiverEmailHtmlContent(form, attachments),
  };

  return email;
};

/**
 * Set emails to mailbox
 */
export const setEmailToMailbox = async function (email, emailGraph, mailbox) {
  await mas.querySudo(`
    PREFIX nmo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nmo#>
    PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>
    PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
    PREFIX core: <http://mu.semte.ch/vocabularies/core/>

    INSERT {
      GRAPH ${sparqlEscapeUri(emailGraph)} {
        ?email
          a nmo:Email ;
          core:uuid "${email.uuid}" ;
          nmo:messageFrom "${email.from}" ;
          nmo:emailTo "${email.to}" ;
          nmo:messageSubject "${email.subject}" ;
          nmo:plainTextMessageContent """${email.plainTextContent}""" ;
          nmo:htmlMessageContent """${email.htmlContent}""" ;
          nmo:sentDate "${moment().format()}" ;
          nmo:isPartOf ?mailfolder .
      }
    }
    WHERE {
      GRAPH ${sparqlEscapeUri(emailGraph)} {
        ?mailfolder
          a nfo:Folder ;
          nie:title ${sparqlEscapeString(mailbox)} .
        BIND(
          IRI(CONCAT(
            "http://data.lblod.info/id/emails/",
            "${email.uuid}"))
          AS ?email)
        }
    }
  `);
};

/**
 * Set the form as converted to avoid re-converting it indefinitely
 */
export const setFormAsConverted = async function (
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
      GRAPH ${sparqlEscapeUri(complaintFormGraph)} {
        ?form ext:isConvertedIntoEmail ?email .
      }
    }
    WHERE {
      GRAPH ${sparqlEscapeUri(emailGraph)} {
        ?email
          a nmo:Email ;
          core:uuid ${sparqlEscapeString(emailUuid)} .
      }
      GRAPH ${sparqlEscapeUri(complaintFormGraph)} {
        ?form
          a ext:ComplaintForm ;
          core:uuid ${sparqlEscapeString(formUuid)} .
      }
    }
  `);
};
