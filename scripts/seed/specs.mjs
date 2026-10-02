// Seed meeting specs for one fictional company, Tidewater: a B2B field-service
// app (scheduling + offline work orders for technicians). Threads run across
// meetings (the offline-sync bug, the Harbor Logistics deal, onboarding
// redesign, hiring) so cross-meeting search and Ask have something real to find.
//
// `truth` holds the planted decisions and action items. The dialogue generator
// must make each one happen naturally in conversation; scripts/eval.ts later
// scores the pipeline's extraction against it (precision / recall).

export const PEOPLE = {
  maya:   { name: 'Maya Chen',     role: 'CEO and co-founder; decisive, keeps meetings moving, asks for owners and dates', voice: 'aura-2-thalia-en' },
  daniel: { name: 'Daniel Okafor', role: 'Head of Engineering; careful, thinks in risks and trade-offs', voice: 'aura-2-zeus-en' },
  priya:  { name: 'Priya Raman',   role: 'Product Manager; data-driven, pushes for scope clarity', voice: 'aura-2-andromeda-en' },
  tom:    { name: 'Tom Becker',    role: 'Design lead; user-empathy, occasionally drifts into detail', voice: 'aura-2-arcas-en' },
  sofia:  { name: 'Sofia Alvarez', role: 'Head of Sales; energetic, optimistic about deals, talks fast', voice: 'aura-2-theia-en' },
  marcus: { name: 'Marcus Reid',   role: 'Customer Success lead; voice of the customer, brings ticket numbers', voice: 'aura-2-orion-en' },
  lena:   { name: 'Lena Novak',    role: 'Senior mobile engineer; dry humour, owns offline sync', voice: 'aura-2-pandora-en' },
  arjun:  { name: 'Arjun Mehta',   role: 'Infra and data engineer; precise, quotes metrics', voice: 'aura-2-hyperion-en' },
  rachel: { name: 'Rachel Kim',    role: 'Director of Operations at Harbor Logistics (prospect); 140 technicians, frustrated with paper work orders', voice: 'aura-2-athena-en' },
  james:  { name: 'James Porter',  role: 'IT manager at Harbor Logistics; cares about SSO, security review, MDM', voice: 'aura-2-hyperion-en' },
};

const COMPANY = `Tidewater is a 30-person startup selling a mobile app for field-service companies: dispatchers schedule jobs, technicians get work orders on their phones, and the app must work offline in basements and rural sites. Current ARR is about $2.1M with 46 customers.`;

export const MEETINGS = [
  {
    slug: 'q4-planning',
    title: 'Q4 planning',
    started_at: '2026-09-29T15:00:00Z',
    people: ['maya', 'daniel', 'priya', 'tom', 'sofia', 'marcus', 'lena', 'arjun'],
    context: `${COMPANY} This is the quarterly planning meeting with the whole leadership group. It's a real working meeting: people disagree, interrupt a bit, joke occasionally, and Maya pushes to close each topic with an owner and a date.`,
    segments: [
      { minutes: 8, brief: `Opening and Q3 review. Maya opens, quick round of how Q3 went. Arjun gives numbers: weekly active technicians up 31%, but sync error rate at 2.4% after the 3.8 release. Marcus says offline-sync tickets are the number one support category, 38 tickets last month. Sofia: Q3 closed $410K new ARR, slightly under the $450K target.` },
      { minutes: 14, brief: `The big debate: offline mode rewrite vs enterprise SSO first. Lena explains the current sync conflicts (last-write-wins drops technician notes). Sofia argues SSO blocks two enterprise deals including Harbor Logistics. Daniel lays out capacity: they can't do both well. Real back-and-forth, Tom raises technician trust. Priya proposes a phased plan.`, truth: ['d1', 'a1', 'a2'] },
      { minutes: 10, brief: `Hiring. Daniel wanted 3 mobile engineers; Maya says budget supports 2 this quarter. Discussion about senior vs mid level. Arjun asks for a data engineer later.`, truth: ['d2', 'a3', 'a4'] },
      { minutes: 10, brief: `Pricing change (moving from per-seat to per-technician tiers). Sofia worries about renewals in Q4; Marcus says 9 renewals land in November. Priya has the analysis.`, truth: ['d3', 'a5'] },
      { minutes: 9, brief: `Harbor Logistics deal and onboarding. Sofia gives an update on Harbor (140 technicians, would be the largest customer). Tom shows thinking on the onboarding redesign: new dispatchers take 9 days to get productive. Marcus wants a checklist in-app.`, truth: ['a6', 'a7', 'a8'] },
      { minutes: 9, brief: `Wrap-up: Maya recaps decisions, confirms owners, picks the beta date, someone asks about the offsite, and they close. A couple of open questions remain unresolved (whether to sunset the legacy web dispatcher; whether to raise a bridge round before the pricing change lands).`, truth: ['a9', 'a10'] },
    ],
    truth: {
      decisions: {
        d1: 'Offline sync rewrite ships before enterprise SSO; offline beta targets November 18, SSO starts in December.',
        d2: 'Hire two mobile engineers this quarter instead of three.',
        d3: 'Delay the per-technician pricing change until January, after the November renewals.',
      },
      actions: {
        a1: { owner: 'Lena Novak', text: 'Write the technical design for conflict-free offline sync', due: 'next Friday' },
        a2: { owner: 'Sofia Alvarez', text: 'Tell Harbor Logistics that SSO is coming in December and ask if that works for their timeline', due: 'this week' },
        a3: { owner: 'Daniel Okafor', text: 'Open the two mobile engineer job postings', due: 'Monday' },
        a4: { owner: 'Maya Chen', text: 'Approve the updated Q4 hiring budget', due: 'Wednesday' },
        a5: { owner: 'Priya Raman', text: 'Share the pricing migration analysis with the renewal-by-renewal impact', due: 'October 10' },
        a6: { owner: 'Tom Becker', text: 'Prototype the new dispatcher onboarding checklist', due: 'two weeks' },
        a7: { owner: 'Marcus Reid', text: 'Pull the top onboarding support questions from the last 90 days for Tom', due: 'Friday' },
        a8: { owner: 'Sofia Alvarez', text: 'Send Harbor Logistics the security questionnaire answers', due: 'Thursday' },
        a9: { owner: 'Arjun Mehta', text: 'Set up a sync error rate dashboard with an alert above 1%', due: 'next week' },
        a10: { owner: 'Priya Raman', text: 'Send the Q4 plan summary to the whole company', due: 'tomorrow' },
      },
    },
  },
  {
    slug: 'mobile-standup',
    title: 'Mobile team standup',
    started_at: '2026-10-01T09:30:00Z',
    people: ['daniel', 'lena', 'arjun', 'tom', 'priya'],
    context: `${COMPANY} Daily standup of the mobile squad, two days after Q4 planning. Brisk, people go in turn, Daniel facilitates.`,
    segments: [
      { minutes: 10, brief: `Round-robin updates. Lena started the offline sync design doc, exploring CRDTs vs operational merge for technician notes; blocked on getting real conflict logs. Arjun has the sync error dashboard half-built, error rate today 2.1%. Tom shares the onboarding checklist sketch. Priya mentions the pricing analysis is almost done. Daniel posted the job listings. A quick tangent about a flaky iOS test, cut short by Daniel. Lena and Daniel agree explicitly on the approach for merging.`, truth: ['d1', 'a1', 'a2', 'a3'] },
    ],
    truth: {
      decisions: { d1: 'Use the CRDT approach only for technician notes; keep last-write-wins for job status fields.' },
      actions: {
        a1: { owner: 'Arjun Mehta', text: 'Export a week of sync conflict logs for Lena', due: 'today' },
        a2: { owner: 'Lena Novak', text: 'Share the first draft of the offline sync design doc', due: 'Thursday' },
        a3: { owner: 'Tom Becker', text: 'Fix the flaky iOS snapshot test or quarantine it', due: 'end of day' },
      },
    },
  },
  {
    slug: 'harbor-discovery',
    title: 'Harbor Logistics discovery call',
    started_at: '2026-09-24T17:00:00Z',
    people: ['sofia', 'marcus', 'rachel', 'james'],
    context: `${COMPANY} A discovery call with a prospect, Harbor Logistics (140 field technicians, HVAC and refrigeration maintenance for warehouses). Sofia runs it, Marcus covers onboarding and support. Rachel is the economic buyer, James handles IT.`,
    segments: [
      { minutes: 12, brief: `Intros. Rachel describes the pain: paper work orders, technicians re-keying data, 15% of jobs need a second visit because info is missing, cold-storage sites have no signal. James asks about offline mode, data security, and how devices are managed (they use Intune).` },
      { minutes: 13, brief: `Requirements and objections. James says SSO with Azure AD is a hard requirement before rollout. Rachel's budget is approved for Q1, around $90K per year. Decision process: Rachel decides, James must pass security review, CFO signs. Marcus describes onboarding (a 30-day rollout plan). Next steps agreed.`, truth: ['d1', 'a1', 'a2', 'a3'] },
    ],
    truth: {
      decisions: { d1: 'Run a 3-week pilot with 12 technicians at the Newark warehouse.' },
      actions: {
        a1: { owner: 'Sofia Alvarez', text: 'Send the proposal and pilot plan to Rachel', due: 'Friday' },
        a2: { owner: 'James Porter', text: 'Send Tidewater the security questionnaire', due: 'Monday' },
        a3: { owner: 'Marcus Reid', text: 'Schedule a demo of offline mode for Harbor technicians', due: 'next week' },
      },
    },
  },
  {
    slug: 'sync-incident-retro',
    title: 'Offline sync incident retro',
    started_at: '2026-09-22T14:00:00Z',
    people: ['daniel', 'lena', 'arjun', 'marcus', 'priya', 'maya'],
    context: `${COMPANY} Blameless post-incident review. On September 18, release 3.8 caused technicians' offline notes to be overwritten when two devices edited the same work order; about 1,200 notes across 9 customers were affected, and 900 were recovered from device backups. Daniel facilitates.`,
    segments: [
      { minutes: 11, brief: `Timeline: release at 10am, first ticket at 1:40pm from a customer in Ohio, Marcus escalated at 3pm, rollback at 6:15pm. Lena explains root cause: a migration changed the merge order so server copies won over newer device copies. Arjun: why monitoring didn't catch it (no metric on overwritten notes).` },
      { minutes: 12, brief: `What went well, what didn't, and fixes. Recovery script by Arjun saved 900 notes. Customer comms were slow. Maya asks for customer-facing follow-up. Agree on action items and a rule about migrations.`, truth: ['d1', 'a1', 'a2', 'a3', 'a4'] },
    ],
    truth: {
      decisions: { d1: 'Any change to sync merge logic requires a second reviewer from the mobile team and a staged rollout.' },
      actions: {
        a1: { owner: 'Arjun Mehta', text: 'Add a metric and alert for overwritten notes', due: 'next sprint' },
        a2: { owner: 'Marcus Reid', text: 'Email the nine affected customers with a summary and recovery status', due: 'tomorrow' },
        a3: { owner: 'Lena Novak', text: 'Write a regression test for two-device concurrent edits', due: 'Friday' },
        a4: { owner: 'Daniel Okafor', text: 'Publish the incident report internally', due: 'Wednesday' },
      },
    },
  },
  {
    slug: 'onboarding-review',
    title: 'Onboarding redesign review',
    started_at: '2026-10-01T16:00:00Z',
    people: ['tom', 'priya', 'lena', 'marcus'],
    context: `${COMPANY} Design review of Tom's prototype for the new dispatcher onboarding checklist. New dispatchers currently take 9 days to schedule their first full week.`,
    segments: [
      { minutes: 12, brief: `Tom walks through the prototype: a 6-step checklist, sample data so dispatchers can practice, a "first week" progress bar. Marcus brings the top support questions (importing technicians from a spreadsheet is #1). Lena flags that sample data must never sync to a real account. Priya asks how success is measured.` },
      { minutes: 10, brief: `Critique and decisions. Cut the step about notification settings (move it later). Agree on the success metric: time to first full scheduled week, from 9 days to 3. Assign follow-ups.`, truth: ['d1', 'd2', 'a1', 'a2', 'a3'] },
    ],
    truth: {
      decisions: {
        d1: 'Drop the notification-settings step from the onboarding checklist.',
        d2: 'The success metric is time to first full scheduled week, target 3 days, down from 9.',
      },
      actions: {
        a1: { owner: 'Tom Becker', text: 'Add spreadsheet import as the first checklist step', due: 'Monday' },
        a2: { owner: 'Lena Novak', text: 'Make sample data local-only so it never syncs', due: 'next sprint' },
        a3: { owner: 'Priya Raman', text: 'Set up tracking for time to first scheduled week', due: 'before launch' },
      },
    },
  },
  {
    slug: 'maya-priya-1on1',
    title: 'Maya / Priya 1:1',
    started_at: '2026-09-30T18:00:00Z',
    people: ['maya', 'priya'],
    context: `${COMPANY} A weekly 1:1 between the CEO and the PM. Warm, candid.`,
    segments: [
      { minutes: 18, brief: `Wins: Priya's phased offline plan landed well at planning. Concern: Priya feels stretched across pricing, onboarding and offline; wants to hand pricing analysis follow-up to someone. Feedback from Maya: Priya should push back earlier when scope grows. Career: Priya wants to lead the product side of the enterprise push. Follow-ups agreed.`, truth: ['d1', 'a1', 'a2'] },
    ],
    truth: {
      decisions: { d1: 'Priya will lead product for the enterprise push starting in January.' },
      actions: {
        a1: { owner: 'Maya Chen', text: 'Ask Sofia to own customer communication for the pricing change', due: 'this week' },
        a2: { owner: 'Priya Raman', text: 'Draft a one-page enterprise product plan', due: 'end of October' },
      },
    },
  },
];
