# Test the mail providers

Labels: `good first issue`, `tests`
Size: small, one evening
Files: `server/lib/mail.test.js` (new), `server/lib/mail.js` (read only)

## What

`server/lib/mail.js` speaks to four providers: Resend, SparkPost, Amazon SES and
plain SMTP. It has no test file. The part worth proving is the request each
provider receives, because a wrong field name means mail silently does not send
until someone notices a missing digest.

## Steps

1. Read `server/lib/mail.js`. It exports `sendMail`, `status`, `resolveConfig`,
   `invalidateConfigCache` and `DEFAULT_FROM`.
2. Look at how `server/lib/safefetch.js` is tested (`server/lib/safefetch.test.js`)
   for the house pattern: a local stub server, no network, no dependency.
3. Test the parts that do not need a real provider:
   - the payload built for each provider (recipient, sender, subject, body)
   - what `status` reports when nothing is configured, and when only the
     environment has a key
   - a provider that answers with an error is reported as a failure, not
     swallowed
4. If a provider needs a real socket, stub the fetch call. Keep `mail.js`
   unchanged.

## Done when

- [ ] `npm test` is green with the new file.
- [ ] No test sends real mail and none needs a key.
- [ ] The error path is covered: a rejected send must not look like success.
- [ ] `npm run check` passes.

## Hints

- Never put a realistic looking key in the test. Use a short fake value and say
  in a comment that it is fake.
