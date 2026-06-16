# `complaint-form-email-converter-service`

Microservice that converts Complaint Forms to emails and places those emails
into an outbox. They will then be picked up by an email sending service.

This service listens to `delta-notifier` messages about new Complaint Form
entries. In addition, it runs a (rather infrequent) cron job to query the
database for forms that have not been converted as a failover mechanism.

## Installation

### Docker-compose snippet

To add the service to your stack, add the following snippet to
`docker-compose.yml`:

```yaml
services:
  complaint-form-email-converter-service:
    image: lblod/complain-form-email-converter-service
    environment:
      COMPLAINT_FORM_GRAPH: "http://graph.uri"
      [...]
    volumes:
      - ./app/templates/:/app/templates/
```

Optionally, you can put the following snippet in the `delta-notifier` config:

```javascript
{
  match: {
    predicate: {
      type: 'uri',
      value: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
    },
    object: {
      type: 'uri',
      value: 'http://mu.semte.ch/vocabularies/ext/ComplaintForm',
    },
  },
  callback: {
    url: 'http://complaint-form-email-converter/delta',
    method: 'POST',
  },
  options: {
    resourceFormat: 'v0.0.1',
    gracePeriod: 250,
    ignoreFromSelf: true,
  },
},

```

## Scopes

This service uses scope support from the new `mu-authorization` /
`sparql-parser` and no longer uses `mu-auth-sudo`. The default URI used by this
service for scoping is

```
http://services.semantic.works/complaint-form-email-converter-service
```

as configured in the `Dockerfile`. This can be overriden via an environment
variable. Use this URI for scoping to the correct graphs for the subjects of
types:

```turtle
<http://mu.semte.ch/vocabularies/ext/ComplaintForm>
<http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#FileDataObject>
<http://www.semanticdesktop.org/ontologies/2007/03/22/nmo#Email>
<http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#Folder>
<http://open-services.net/ns/core#Error>
```

See [the documentation on
scoping](https://github.com/mu-semtech/sparql-parser#define-access-rights-for-specific-services)
for more information.

## Environment variables

* `COMPLAINT_FORM_CRON_PATTERN`: <em>(optional, default: '0 * * * *' (= every
  hour))</em> Frequency of the cron job for scanning unconverted forms.
* `EMAIL_FROM_ADDRESS_TO_COMPLAINER`: <em>(optional, default:
  'noreply-binnenland@vlaanderen.be')</em>
* `EMAIL_FROM_ADDRESS_TO_ABB`: <em>(optional, default:
  'noreply@lblod.info')</em>
* `EMAIL_TO_ADDRESS`: <em>(optional, default: 'binnenland@vlaanderen.be')</em>
* `DEFAULT_MU_AUTH_SCOPE`: <em>(optional, default:
  'http://services.semantic.works/complaint-form-email-converter-service')</em>
  URI for scoping in `mu-authorization` / `sparql-parser`.
* `CREATOR`: <em>(optional, default:
  'http://lblod.data.gift/services/complaint-form-email-converter-service')</em>
  The URI for this service that will be linked to in error messages.
* `ERROR_BASE`: <em>(optional, default: 'http://data.lblod.info/errors/')</em>
  The base for URIs of errors.
