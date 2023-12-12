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

```json
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

### Environment variables

* `COMPLAINT_FORM_CRON_PATTERN`: <em>(optional, default: '0 * * * *' (= every
  hour))</em> Frequency of the cron job for scanning unconverted forms.
* `COMPLAINT_FORM_GRAPH`: <em>(optional, default:
  'http://mu.semte.ch/graphs/public')</em> The graph to query the Complaint
  Form data from.
* `FILE_GRAPH`: <em>(optional, default:
  'http://mu.semte.ch/graphs/public')</em>
* `EMAIL_GRAPH`: <em>(optional, default:
  'http://mu.semte.ch/graphs/system/email')</em> The graph to store the
  converted emails to.
* `EMAIL_FROM_ADDRESS_TO_COMPLAINER`: <em>(optional, default:
  'noreply-binnenland@vlaanderen.be')</em>
* `EMAIL_FROM_ADDRESS_TO_ABB`: <em>(optional, default:
  'noreply@lblod.info')</em>
* `EMAIL_TO_ADDRESS`: <em>(optional, default: 'binnenland@vlaanderen.be')</em>
* `CREATOR`: <em>(optional, default:
  'http://lblod.data.gift/services/complaint-form-email-converter-service')</em>
  The URI for this service that will be linked to in error messages.
* `ERROR_GRAPH`: <em>(optional, default:
  'http://mu.semte.ch/graphs/error')</em> The graph in which to store errors.
* `ERROR_BASE`: <em>(optional, default: 'http://data.lblod.info/errors/')</em>
  The base for URIs of errors.
