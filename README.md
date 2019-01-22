# complaint-form-email-converter-service

Microservice that converts complaint forms to emails and place those emails into
an outbox. They will then be picked up by an email sending service.

## Installation

### Docker-compose snippet

To add the service to your stack, add the following snippet to docker-compose.yml:

```
services:
  complaint-form-email-converter-service:
    image: lblod/complain-form-email-converter-service
    environment:
      COMPLAINT_FORM_GRAPH: "http://graph.uri"
      [...]
    volumes:
      - ./app/templates/:/app/templates/
```

### Environment variables

```
COMPLAINT_FORM_CRON_PATTERN: optional, default '*/1 * * * * *'
COMPLAINT_FORM_GRAPH: optional, default 'http://mu.semte.ch/application'
FILE_GRAPH: optional, default 'http://mu.semte.ch/application'
EMAIL_GRAPH: optional, default 'http://mu.semte.ch/graphs/system/email'
EMAIL_FROM_ADDRESS: optional, default 'noreply-binnenland@vlaanderen.be'
EMAIL_TO_ADDRESS: optional, default 'binnenland@vlaanderen.be'
FILE_DOWNLOAD_PREFIX: optonal, default 'localhost'
MAILBOX: optional, default 'outbox'
```

### Development

```
services:
  complaint-form-email-converter-service:
    image: lblod/complaint-form-email-converter-service
    ports:
      - "200:80"
    environment:
      NODE_ENV: "development"
      GMAIL_OR_SERVER: "..."
      [...]
    links:
      - database:database
    volumes:
      - /path/to/your/service/:/app/
      - ./app/templates/:/app/templates/
```
