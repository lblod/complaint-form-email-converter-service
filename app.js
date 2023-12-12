import { app, errorHandler } from 'mu';
import * as env from './env';
import * as support from './support';
import { CronJob } from 'cron';

app.get('/', async function (req, res) {
  res.send('Hello from complaint-form-email-converter-service');
});

new CronJob(
  env.cronFrequency,
  async function () {
    console.log(
      `Complaint form to email conversion triggered by cron job at ${new Date().toISOString()}`,
    );
    await fetchAndConvertComplaintForms();
  },
  null,
  true,
);

app.patch('/complaint-form-email-converter/', async function (req, res) {
  res.status(200).end();
  await fetchAndConvertComplaintForms();
});

app.post('/delta', async function (req, res) {
  res.status(200).end();
  //NOTE we could perform the following function based on the delta
  //changesets, by filtering and selecting for a subject of the correct type,
  //but this will be just as much "database stress" as what normally happens
  //with a cron job. So just do the same thing as with a cron job.
  await fetchAndConvertComplaintForms();
});

async function fetchAndConvertComplaintForms() {
  try {
    const forms = await support.fetchFormsToBeConverted(env.complaintFormGraph);
    if (!forms.length) console.log('No forms found that need to be converted');
    else console.log(`Found ${forms.length} forms to convert`);

    for (const form of forms) {
      try {
        console.log(`Fetching attachments for form ${form.uuid}`);
        const attachments = await support.fetchFormAttachments(
          env.complaintFormGraph,
          env.fileGraph,
          form.uuid,
        );

        console.log(`Creating emails for form ${form.uuid}`);
        const senderEmail = support.createSenderEmail(
          form,
          attachments,
          env.fromAddressToComplainer,
        );
        const receiverEmail = support.createReceiverEmail(
          form,
          attachments,
          env.fromAddressToAbb,
          env.toAddress,
        );

        console.log(`Inserting emails to mailbox "${env.mailbox}"`);
        await support.setEmailToMailbox(
          senderEmail,
          env.emailGraph,
          env.mailbox,
        );
        await support.setEmailToMailbox(
          receiverEmail,
          env.emailGraph,
          env.mailbox,
        );

        console.log(`Setting form ${form.uuid} to "converted"`);
        await support.setFormAsConverted(
          env.complaintFormGraph,
          env.emailGraph,
          form.uuid,
          senderEmail.uuid,
        );
        await support.setFormAsConverted(
          env.complaintFormGraph,
          env.emailGraph,
          form.uuid,
          receiverEmail.uuid,
        );

        console.log(`End of processing form ${form.uuid}`);
      } catch (formError) {
        const errorMsg = `An error has occured while processing form ${form.uuid}`;
        console.error(errorMsg + `:  ${formError.message}`);
        await support.sendErrorAlert(
          errorMsg,
          formError.message,
          form.complaintForm,
        );
      }
    }
  } catch (generalError) {
    console.error(`An error has occured: ${generalError.message}`);
    await support.sendErrorAlert(
      'A general error has occured.',
      generalError.message,
    );
  }
}

app.use(errorHandler);
