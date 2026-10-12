---
name: release-readiness
description: "Use before a product is released or sold, or when asked whether it is ready for paying customers, a buyer, or due diligence. Triggers: is this ready to release, release checklist, SaaS readiness, can we sell this, due diligence, exit ready, what is missing before launch, GDPR before launch, je to pripraveno k vydani, co chybi pred spustenim, pripravenost na prodej."
---

# Release readiness

A product released without its accounts, rights, data rules and numbers in order is worth less
and can be stopped by one missing paper. This skill walks the person's checklist for a product
they release, under Czech and EU law, and marks each item with evidence. It does not write
contracts or give legal advice: a legal item is checked against its source, and a lawyer signs
what matters.

## How to run it

1. Go through the list below for the named product. Mark each item `have` (with the path, link
   or document that proves it), `missing`, or `n/a` (with why).
2. Look the evidence up yourself: the repository, CI config, docs, `qsm-secrets`, the person's
   notes. Ask only for what no file holds.
3. A legal item marked "verify" is checked against its primary source (zakonyprolidi.cz, EUR-Lex,
   upv.gov.cz, euipo.europa.eu) before you state it, because a remembered rule is often an older
   or a foreign one.
4. Every `missing` becomes one task in the task tool.

## The list

Accounts and access

- Every business account on the company domain, never a personal mailbox.
- Every credential in the password manager (Bitwarden through `qsm-secrets`), in vaults by area.
- One registry of services: login, who has access, monthly cost, renewal date.
- MFA on hosting, payments, code, DNS and email.

Rights (verify)

- Code from employees is an employee work (zakon 121/2000 Sb., s. 58).
- Code from contractors needs a written exclusive licence. Czech law lets an author license the
  economic rights but not transfer them (s. 26).
- Brand and domain checked against UPV and EUIPO trademark registers.

Company and money

- One clean entity (an s.r.o. by default), records current in the obchodni rejstrik.
- Annual accounts filed in the sbirka listin. An unfiled year is a common finding.
- Business bank account, never personal.
- Accounting software and an accountant, books closed monthly.
- Revenue analytics wired to the payment processor from day one: MRR and its movements,
  churn, net revenue retention. This history cannot be backfilled.

Product

- Product analytics with an activation metric and feature adoption.
- Analytics and session recording only with consent where the law asks for it (verify the
  ePrivacy and GDPR basis), and hosted in the EU.
- Accessibility: if the European Accessibility Act covers the product, run the `a11y-audit`
  skill. Which criteria and who is covered is the `a11y-conformance` skill.

Engineering

- Code in a private repository, access revoked for anyone who left.
- CI with tests that run the real path, and a deploy plus rollback a person can describe.
- Staging separate from production.
- Monitoring and alerting, with a named way to learn of an outage before a customer does.
- An architecture diagram: each external dependency and what happens when it is down.
- An open-source licence list. Copyleft code inside a closed product is a finding.
- Backups with a tested restore, and a written incident response.

Legal (verify)

- Privacy policy matches what the product really does with data.
- A data processing agreement with every sub-processor (GDPR art. 28).
- Records of processing (art. 30) unless the exemption applies.
- Terms of service allow assignment on a change of control.
- Consumer sales: the EU withdrawal and digital-content rules, if customers are consumers.
- Contracts and NDAs under Czech law and Czech courts by default.

Running it

- A short monthly note on what changed in the numbers and why.
- A cancellation reason log.
- Every process done regularly is written down, so it does not live in one head.

## Red flags

- When you are about to mark an item `have` without a path or document, mark it `missing`,
  because an unproven item fails due diligence the same way a missing one does.
- When you are about to state a law, a section or a deadline from memory, check the source or
  write "unverified", because the person may act on it.
- When an item is a US default (Delaware, a US holding, CCPA), use the Czech or EU equivalent, and
  raise the US route only if the person names a US buyer.

## Say it in the reply

A table: item, `have` / `missing` / `n/a`, evidence. Below it the count of each, the task ids
created, and which legal items still need a lawyer or a source check.
