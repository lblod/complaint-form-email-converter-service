import { app, errorHandler } from 'mu';
import * as env from 'env';
import { CronJob } from 'cron';
import {
  fetchFormsToBeConverted,
  fetchFormAttachments,
  createSenderEmail,
  createReceiverEmail,
  setEmailToMailbox,
  setFormAsConverted,
} from './support';
import request from 'request';

app.get('/', async function (req, res) {
  res.send('Hello from complaint-form-email-converter-service');
});

new CronJob(
  env.cronFrequency,
  function () {
    console.log(
      `Complaint form to email conversion triggered by cron job at ${new Date().toISOString()}`,
    );
    request.patch('http://localhost/complaint-form-email-converter/');
  },
  null,
  true,
);

app.patch('/complaint-form-email-converter/', async function (req, res, next) {
  try {
    const forms = await fetchFormsToBeConverted(env.complaintFormGraph);
    if (forms.length == 0) {
      console.log('No forms found that need to be converted');
      return res.status(204).end();
    }
    console.log(`Found ${forms.length} forms to convert`);

    Promise.all(
      forms.map(async (form) => {
        try {
          console.log(`Fetching attachments for form ${form.uuid}`);
          const attachments = await fetchFormAttachments(
            env.complaintFormGraph,
            env.fileGraph,
            form.uuid,
          );

          console.log(`Creating emails for form ${form.uuid}`);
          const senderEmail = createSenderEmail(
            form,
            attachments,
            env.fromAddressToComplainer,
          );
          const receiverEmail = createReceiverEmail(
            form,
            attachments,
            env.fromAddressToAbb,
            env.toAddress,
          );

          console.log(`Inserting emails to mailbox "${env.mailbox}"`);
          await setEmailToMailbox(senderEmail, env.emailGraph, env.mailbox);
          await setEmailToMailbox(receiverEmail, env.emailGraph, env.mailbox);

          console.log(`Setting form ${form.uuid} to "converted"`);
          await setFormAsConverted(
            env.complaintFormGraph,
            env.emailGraph,
            form.uuid,
            senderEmail.uuid,
          );
          await setFormAsConverted(
            env.complaintFormGraph,
            env.emailGraph,
            form.uuid,
            receiverEmail.uuid,
          );

          console.log(`End of processing form ${form.uuid}`);
        } catch (e) {
          console.log(
            `An error has occured while processing form ${form.uuid}: ${e.message}`,
          );
        }
      }),
    );
  } catch (e) {
    return next(new Error(e.message));
  }
});

app.use(errorHandler);
