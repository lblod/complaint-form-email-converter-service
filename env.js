import envvar from 'env-var';

export const cronFrequency = envvar
  .get('COMPLAINT_FORM_CRON_PATTERN')
  .default('*/1 * * * *');
export const complaintFormGraph = envvar
  .get('COMPLAINT_FORM_GRAPH')
  .default('http://mu.semte.ch/application');
export const emailGraph = envvar
  .get('EMAIL_GRAPH')
  .default('http://mu.semte.ch/graphs/system/email');
export const fileGraph = envvar
  .get('FILE_GRAPH')
  .default('http://mu.semte.ch/application');
export const fromAddressToComplainer = envvar
  .get('EMAIL_FROM_ADDRESS_TO_COMPLAINER')
  .default('noreply-binnenland@vlaanderen.be');
export const fromAddressToAbb = envvar
  .get('EMAIL_FROM_ADDRESS_TO_ABB')
  .default('noreply@lblod.info');
export const toAddress = envvar
  .get('EMAIL_TO_ADDRESS')
  .default('binnenland@vlaanderen.be');
export const mailbox = envvar.get('MAILBOX').default('outbox');
