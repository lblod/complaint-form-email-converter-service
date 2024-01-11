import envvar from 'env-var';

export const cronFrequency = envvar
  .get('COMPLAINT_FORM_CRON_PATTERN')
  .default('0 * * * *')
  .asString();
export const complaintFormGraph = envvar
  .get('COMPLAINT_FORM_GRAPH')
  .default('http://mu.semte.ch/graphs/public')
  .asString();
export const emailGraph = envvar
  .get('EMAIL_GRAPH')
  .default('http://mu.semte.ch/graphs/system/email')
  .asString();
export const fileGraph = envvar
  .get('FILE_GRAPH')
  .default('http://mu.semte.ch/graphs/public')
  .asString();
export const fromAddressToComplainer = envvar
  .get('EMAIL_FROM_ADDRESS_TO_COMPLAINER')
  .default('noreply-binnenland@vlaanderen.be')
  .asString();
export const fromAddressToAbb = envvar
  .get('EMAIL_FROM_ADDRESS_TO_ABB')
  .default('noreply@lblod.info')
  .asString();
export const toAddress = envvar
  .get('EMAIL_TO_ADDRESS')
  .default('binnenland@vlaanderen.be')
  .asString();
export const mailbox = envvar.get('MAILBOX').default('outbox').asString();

export const creator = envvar
  .get('CREATOR')
  .default(
    'http://lblod.data.gift/services/complaint-form-email-converter-service',
  )
  .asString();
export const errorGraph = envvar
  .get('ERROR_GRAPH')
  .default('http://mu.semte.ch/graphs/error')
  .asString();
export const errorBase = envvar
  .get('ERROR_BASE')
  .default('http://data.lblod.info/errors/')
  .asString();
