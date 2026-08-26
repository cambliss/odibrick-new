from builder import Guide
from mockup import Screen, NAV_ADMIN

g = Guide(
    role="Platform administration",
    title="Running the\nplatform",
    lede=("Control centre, users and roles, payments, commissions, campaigns, "
          "support, maintenance and insurance — one guide for every staff role."),
    audience="Odibrick admins, marketing, support, property managers and partners",
)

g.h2("What is in this guide")
g.toc([
    "Roles and what each can actually do",
    "The control centre",
    "Users, roles and account status",
    "Recording payments and issuing refunds",
    "Commission rules and invoicing",
    "Platform settings",
    "The audit log",
    "Marketing: the campaign board",
    "Support: the ticket queue",
    "Property managers: inspections and maintenance",
    "Insurance partners: confirming a policy",
    "Things the platform deliberately will not let you do",
])

# ------------------------------------------------------------------ roles
g.h2("1. Roles and what each can actually do")

g.p("Twelve roles, twenty-eight permissions. A person can hold several roles and "
    "their effective access is the union. What follows is the staff side.")

g.table(
    ["Role", "Can do", "Cannot do"],
    [["Super admin", "Everything.",
      "Nothing is withheld — which is why this role should be held by as few people "
      "as possible."],
     ["Admin", "Users, KYC, moderation, payments, commissions, marketing, "
      "maintenance, insurance, disputes, support, settings, audit, analytics.",
      "<strong>Draft or approve agreements.</strong> Legal work belongs to the legal "
      "team."],
     ["Legal team", "Cases, drafting, approval, disputes, read any document.",
      "Touch payments, users or settings."],
     ["Verification team", "KYC review, listing moderation, private property data.",
      "Anything financial or legal."],
     ["Marketing", "Packages, campaigns, analytics.",
      "See users, payments or properties. Selling reach does not require the "
      "ledger."],
     ["Property manager", "Inspections, maintenance, private property data.",
      "Payments, users, legal."],
     ["Support", "Tickets, read users, read payments.",
      "Change anything financial or approve anything."],
     ["Insurance partner", "Confirm a policy they issued.",
      "Everything else. One permission, deliberately."]])

g.note("An admin cannot draft or approve an agreement. This is not an oversight — "
       "it is the separation the whole legal guarantee rests on. If an admin needs "
       "legal access, they need the legal role granted explicitly and audited, not a "
       "workaround.", kind="warn")

# ----------------------------------------------------------------- control
g.pagebreak()
g.h2("2. The control centre")

s = Screen()
s.appbar("Operations Desk")


def body(b):
    b.gap(10)
    b.h1("Control centre", 15)
    b.para("Every figure is computed from the database at request time.")
    b.gap(6)
    b.datarows([("Users", "1,284"), ("Live listings", "412"),
                ("Active tenancies", "96"), ("Awaiting verification", "23")],
               title="Platform")
    b.card("Revenue, last 12 months",
           ["Jun  ████████████████░░░░░░  ₹4.2 L",
            "Jul  ██████████████████░░░░  ₹4.9 L",
            "Aug  ███████████████████████ ₹6.1 L"], h=68)
    b.card("Funnel, last 30 days",
           ["Property views      18,402",
            "Enquiries            1,204",
            "Applications           218",
            "Tenancies created       31    (0.17% view-to-tenancy)"], h=76)


s.sidebar_page(NAV_ADMIN, "Control centre", body)
g.mock(s, "The admin control centre")

g.note("Nothing on this page is a placeholder or a projection. Every number is a "
       "query against the live database. If a figure looks wrong, it is either "
       "genuinely wrong in the data or the query needs fixing — it is not a demo "
       "value someone forgot to remove.", kind="tip")

g.h3("What to watch")
g.table(
    ["Signal", "What it usually means"],
    [["Awaiting verification climbing",
      "The verification team is under-resourced. Users are blocked in the meantime."],
     ["View-to-tenancy falling", "Look at where the funnel narrows before assuming "
      "it is a traffic problem."],
     ["Commission revenue flat while tenancies rise",
      "Commissions are being scheduled but not invoiced. Check the commission "
      "queue."],
     ["One city dominating", "Fine early on. Worth knowing before you plan spend."]])

# ------------------------------------------------------------------ users
g.h2("3. Users, roles and account status")

s = Screen()
s.gap(10)
s.h1("Users", 15)
s.field_row([("Search", "priya", 220), ("Role", "All", 140), ("Status", "Active", 140)])
s.gap(10)
s.table(["Name", "Roles", "KYC", "Listings", "Status"],
        [["Priya Sharma", "Tenant", "Verified", "0", "Active"],
         ["Ramesh Reddy", "Owner", "Verified", "3", "Active"],
         ["Skyline Realty", "Agent", "Verified", "34", "Active"]],
        widths=[170, 120, 110, 90, 100])
g.mock(s, "User management")

g.h3("Changing account status")
g.p("Suspending an account revokes every outstanding session immediately, so the "
    "user is signed out everywhere. It is a real consequence for a real person — "
    "record a reason, and prefer a support conversation first where one is "
    "possible.")

g.h3("Granting roles")
g.p("Roles are granted individually and every grant is audited. Two constraints are "
    "enforced:")
g.ul([
    "Only a super admin can grant the super admin role.",
    "Nobody can change their own account status.",
])

g.note("Give one person one account. Every action in the platform is audited against "
       "an actor, and a shared login destroys that entirely — a shared admin account "
       "means no audit log worth having.", kind="warn")

# ---------------------------------------------------------------- payments
g.pagebreak()
g.h2("4. Recording payments and refunds")

g.p("With the default non-custodial provider, money moves directly between the "
    "parties and an operator confirms the credit. This is the most consequential "
    "routine action in the platform, so it has guardrails.")

s = Screen()
s.gap(10)
s.eyebrow("ODB-PAY-2026-000412")
s.h1("Security deposit — ₹1,12,000", 15)
s.badges([("Due", "ochre")])
s.gap(4)
s.datarows([("Payer", "Priya Sharma"), ("Payee", "Ramesh Reddy"),
            ("Property", "2 BHK apartment, Gachibowli"),
            ("Due date", "13 Jun 2026")], title="Payment")
s.field_row([("Bank or UPI reference", "NEFT2026061300418", 260),
             ("Method", "NEFT", 140)])
s.gap(10)
s.button("Record payment received", w=220)
g.mock(s, "Recording an off-platform payment")

g.step(1, "Match the credit against the bank statement first",
       "<p>Amount, date and reference. Do not record from a screenshot the payer "
       "sent you — a screenshot is not a bank statement.</p>")

g.step(2, "Enter the real bank reference",
       "<p>The system requires one and will refuse without it. That reference is "
       "what makes the record defensible a year later.</p>")

g.step(3, "Record it",
       "<p>The payment is marked paid, both parties are notified, the receipt is "
       "generated, and the action is audited with your name on it.</p>")

g.note("Marking a payment paid that did not arrive is, in effect, telling a landlord "
       "they have been paid when they have not. The bank reference requirement "
       "exists to make that mistake hard, not to slow you down.", kind="warn")

g.h3("Refunds")
g.p("Under the non-custodial provider, you send the money by bank transfer and then "
    "record it with its reference. The ledger shows a refund transaction against the "
    "original payment, and a partial refund is recorded as such rather than "
    "overwriting the original amount.")

# ------------------------------------------------------------- commissions
g.h2("5. Commission rules and invoicing")

g.p("Commissions are generated automatically when a tenancy starts, one row per "
    "tenancy year, sitting at <strong>Scheduled</strong> until someone invoices "
    "them.")

s = Screen()
s.gap(10)
s.h1("Commissions", 15)
s.table(["Tenancy", "Cycle", "Base", "Commission", "Status"],
        [["Gachibowli 2 BHK", "2026", "₹28,000", "₹23,800 + GST", "Scheduled"],
         ["Kokapet 3 BHK", "2026", "₹52,000", "₹44,200 + GST", "Invoiced"],
         ["Kondapur 2 BHK", "2026", "₹26,000", "₹13,000 + GST", "Paid"]],
        widths=[180, 80, 110, 160, 100])
s.button("Invoice selected", w=160)
g.mock(s, "The commission queue")

g.h3("Editing rules")
g.p("Rules carry a date range and an optional city. A city-specific rule wins over "
    "the general one. To change pricing, add a new rule with a future effective date "
    "and close the old one — do not edit a rule that is already in force.")

g.note("Changing a rule never reprices an existing tenancy. Whatever rule applied "
       "when a tenancy started governs it for its whole life. This is deliberate and "
       "it is the behaviour you want to be able to explain to an owner.")

# ---------------------------------------------------------------- settings
g.h2("6. Platform settings")

g.table(
    ["Setting group", "Contains", "Care needed"],
    [["Brand", "Name, promise", "Low"],
     ["Commission", "Default rule, grace days", "Medium — affects new tenancies"],
     ["Payments", "Provider, settlement mode",
      "<strong>High.</strong> Switching to a gateway needs a merchant account and a "
      "webhook secret in place first"],
     ["Listing", "Free unlimited flag, auto-publish",
      "<strong>High.</strong> Auto-publish bypasses human verification and should "
      "stay off"],
     ["Search", "Default city, launch cities", "Low"],
     ["Tax", "GST rate", "Medium — affects invoicing"]])

g.note("<code>listing.auto_publish</code> exists as a setting but turning it on "
       "removes the human check that gives a verification badge its meaning. If "
       "somebody proposes enabling it to clear a queue backlog, the answer is more "
       "reviewers, not fewer checks.", kind="warn")

# ------------------------------------------------------------------ audit
g.h2("7. The audit log")

g.p("Every consequential action is recorded: verification decisions, drafts, "
    "approvals, signatures, payment recording, refunds, role grants, settings "
    "changes, dispute updates. Each entry has an actor, a role, an object, an IP "
    "address and a timestamp.")

s = Screen()
s.gap(10)
s.h1("Audit log", 15)
s.table(["When", "Actor", "Action", "Object"],
        [["20 Aug 14:02", "Operations Desk", "payment.recorded_offline", "payment #412"],
         ["20 Aug 11:47", "Adv. S. Menon", "agreement.approved", "agreement #118"],
         ["20 Aug 09:15", "Verification Desk", "property.verified", "property #204"],
         ["19 Aug 16:30", "Odibrick Admin", "user.role_granted", "user #88"]],
        widths=[130, 160, 210, 130])
g.mock(s, "The audit log")

g.p("Filter by actor, action prefix or object type. When a user disputes something "
    "that happened, this is where the answer is, and it is the first place to look "
    "rather than the last.")

g.note("The application database user has no delete grant on the audit table, and "
       "financial and legal records are never hard-deleted. The log and the data it "
       "describes stay in agreement by construction.")

# -------------------------------------------------------------- marketing
g.pagebreak()
g.h2("8. Marketing: the campaign board")

s = Screen()
s.gap(10)
s.h1("Campaign board", 15)
s.card("Tech corridor rentals · Skyline Realty",
       ["Growth package · ₹24,999 · order PAID",
        "Budget ₹15,000 · spent ₹6,420 · 62,180 impressions · 43 leads",
        "6 properties linked · runs 05 Aug — 04 Sep"],
       tone="seal", note="LIVE · MANAGER: CAMBLISS CAMPAIGNS")
s.card("Meridian Heights launch · Meridian Developers",
       ["Builder Enterprise · custom quote · order REQUESTED",
        "Awaiting scoped proposal"],
       tone="ochre", note="REQUESTED")
g.mock(s, "The Cambliss campaign board")

g.h3("Moving a campaign through production")
g.p("Requested → Approved → In production → Scheduled → Live → Completed. Two "
    "behaviours are enforced rather than left to discipline:")

g.ul([
    "<strong>A campaign cannot go Live until its order is Paid.</strong> The "
    "transition is blocked. Do not work around this by marking an order paid without "
    "a payment behind it.",
    "<strong>Featured placement follows the campaign automatically.</strong> Going "
    "live sets the promoted flag on linked properties; pausing or completing clears "
    "it. Nobody keeps a slot they are no longer paying for.",
])

g.h3("Reporting performance")
g.p("Impressions, clicks, spend and leads are entered from the ad platforms. Where a "
    "figure has not been reported, leave it empty — the client dashboard shows "
    "nothing rather than an estimate, which is the honest presentation and the one "
    "you can defend.")

# ---------------------------------------------------------------- support
g.h2("9. Support: the ticket queue")

g.p("Tickets are ordered urgent first, then by age. You can read the requester's "
    "account and their payments, which covers most of what a ticket needs.")

s = Screen()
s.gap(10)
s.eyebrow("ODB-SUP-2026-000114")
s.h1("My Aadhaar upload keeps failing", 15)
s.badges([("Open", "ochre"), ("KYC", "neutral"), ("Normal", "neutral")])
s.card("Priya Sharma · 2 days ago",
       ["The file is a 6 MB PDF scan and the upload just spins."], h=42)
s.field("Reply", "Try re-saving the scan as a JPEG under 10 MB…")
s.gap(2)
s.para("[ ] Internal note (not visible to the requester)")
s.buttons([("Send reply", "primary"), ("Mark resolved", "secondary")])
g.mock(s, "Working a support ticket")

g.table(
    ["Situation", "Route it to"],
    [["Identity or listing verification", "The verification team, via the queue"],
     ["Anything about agreement wording", "The legal team. Do not interpret a clause "
      "yourself"],
     ["A payment that has not been recorded", "An admin with payment.manage"],
     ["A dispute between owner and tenant", "The dispute process, not a ticket reply"],
     ["A platform bug", "Capture the trace ID from the error and escalate"]])

g.note("Internal notes are hidden from the requester and the filtering is enforced "
       "server-side. Still write them as though they might one day be read out — "
       "they are part of the record.")

# ------------------------------------------------------------ prop manager
g.h2("10. Property managers: inspections and maintenance")

g.p("Property managers can create inspections and manage maintenance across "
    "properties, and can see private property data. They cannot touch payments, "
    "users or legal.")

g.h3("Periodic inspections")
g.p("Same wizard as the Day 1 report, with the kind set to Periodic or Maintenance. "
    "Room by room, photograph what matters, submit. The report joins the property's "
    "record permanently.")

g.h3("Working maintenance requests")
g.table(
    ["Priority", "Response expectation"],
    [["Emergency", "Same day. Something is actively causing damage."],
     ["High", "Within 48 hours."],
     ["Normal", "Within a week."],
     ["Low", "Scheduled with other work."]])

g.p("Record the cost bearer honestly — owner, tenant, shared, Odibrick, or "
    "undecided. <em>Undecided</em> is a legitimate state while responsibility is "
    "being worked out, and it is better than guessing.")

# --------------------------------------------------------------- insurance
g.h2("11. Insurance partners: confirming a policy")

g.p("An insurance partner account holds exactly one permission: confirming a policy "
    "the partner has issued. It cannot see users, tenancies or payments.")

s = Screen()
s.gap(10)
s.h1("Confirm policy", 15)
s.card("Tenant contents cover · request #44",
       ["Holder: Priya Sharma · sum insured ₹3,00,000",
        "Premium ₹4,200 — PAID 14 Jun 2026",
        "Status: PAYMENT PENDING — cover is not in force"], tone="ochre", h=58)
s.field_row([("Policy number", "TC/2026/889201", 220),
             ("Starts on", "15 Jun 2026", 160)])
s.gap(10)
s.field("Expires on", "14 Jun 2027", w=220)
s.button("Confirm and activate cover", w=230)
g.mock(s, "A partner confirming an issued policy")

g.note("<strong>Odibrick does not issue insurance.</strong> A policy becomes Active "
       "only when a partner enters the policy number the insurer actually issued. "
       "Until then the platform tells the customer plainly that cover is not in "
       "force. The catalogue also separates INSURANCE_POLICY products, underwritten "
       "by a licensed insurer, from ODIBRICK_SERVICE products, which are platform "
       "services that pay no claims — never let a customer conversation blur "
       "those.", kind="warn")

# ------------------------------------------------------------------ limits
g.h2("12. What the platform will not let you do")

g.table(
    ["It refuses", "Why"],
    [["Mark a payment paid without a bank or provider reference",
      "A payment record without a reference is an assertion, not evidence."],
     ["Set a campaign live on an unpaid order",
      "Featured placement is a paid product. Extending informal credit through the "
      "UI is not available."],
     ["Grant super admin unless you are one", "Privilege escalation control."],
     ["Change your own account status", "Self-suspension and self-reinstatement."],
     ["Approve an agreement as an admin",
      "Legal approval belongs to the legal team, and the permission is not granted "
      "to admins."],
     ["Activate an insurance policy without a policy number",
      "Odibrick is not the insurer and cannot put cover in force."],
     ["Delete an audit entry",
      "The application database user has no delete grant on that table."]])

g.p("Each of these is enforced in the service layer, not the interface. Hiding a "
    "button would not be enforcement, and an API call that tries to go around one "
    "gets the same refusal.")

g.h2("Where to get help")
g.p("Platform bugs go through a ticket with the trace ID attached. Anything "
    "involving money, legal wording or a user's account status is worth a second "
    "opinion before you act — the actions in this guide are the consequential ones, "
    "and every one of them carries your name in the audit log.")

g.build("/home/claude/guides/out/Odibrick-Administration-Guide.pdf")
print("administration guide built")
