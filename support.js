import { sparqlEscapeUri } from 'mu';
import { querySudo as query } from './auth-sudo';

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
 * @method fetchFormsToBeConverted
 * @return {Array}
 */
const fetchFormsToBeConverted = async function(complaintFormGraph) {
  const result = await query(`
    PREFIX nmo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nmo#>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX schema: <http://schema.org/>
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

    SELECT ?complaintForm ?name ?contactPersonName ?street ?houseNumber ?addressComplement ?locality ?postalCode ?telephone ?senderEmail ?content ?created ?attachments
    WHERE {
        GRAPH ${sparqlEscapeUri(complaintFormGraph)} {
          ?complaintForm a ext:ComplaintForm;
              foaf:name ?name;
              schema:streetAddress ?street;
              schema:postOfficeBoxNumber ?houseNumber;
              schema:addressLocality ?locality;
              schema:postalCode ?postalCode;
              schema:email ?senderEmail;
              ext:content ?content;
              dct:created ?created.

          BIND('' as ?defaultContactPersonName).
          OPTIONAL { ?complaintForm ext:personName ?optionalContactPersonName }.
          BIND(coalesce(?optionalContactPersonName, ?defaultContactPersonName) as ?contactPersonName).

          BIND('' as ?defaultAddressComplement).
          OPTIONAL { ?complaintForm ext:addressComplement ?optionalAddressComplement }.
          BIND(coalesce(?optionalAddressComplement, ?defaultAddressComplement) as ?addressComplement).

          BIND('' as ?defaultTelephone).
          OPTIONAL { ?complaintForm schema:telephone ?optionalTelephone }.
          BIND(coalesce(?optionalTelephone, ?defaultTelephone) as ?telephone).

          BIND('' as ?defaultAttachments).
          OPTIONAL { ?complaintForm nmo:hasAttachment ?optionalAttachments }.
          BIND(coalesce(?optionalAttachments, ?defaultAttachments) as ?attachments).
        }
    }
  `);
  return parseResult(result);
};

export {
  fetchFormsToBeConverted
};
