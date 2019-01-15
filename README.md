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
      [...]
```

### Environment variables

To be completed

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
      - /path/to/your/code/:/app/
```
