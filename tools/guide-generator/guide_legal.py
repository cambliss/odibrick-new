from builder import Guide
from mockup import Screen, NAV_LEGAL

g = Guide(
    role="Legal team",
    title="Cases, drafting\nand approval",
    lede=("The case queue, the clause library, the consultation, and the two rules "
          "the system will not let you break."),
    audience="Qualified legal professionals working on the Odibrick platform",
)

g.h2("What is in this guide")
g.toc([
    "Your responsibility, and the system's",
    "The two rules enforced in code",
    "The case queue",
    "Opening a case",
    "The clause library",
    "Drafting an agreement",
    "Scheduling and running the consultation",
    "Approving a version",
    "Signature and execution",
    "Disputes",
    "What the platform will not do",
])

# ------------------------------------------------------------ responsibility
g.h2("1. Your responsibility, and the system's")

g.p("Odibrick's central promise to users is that a qualified person reads the "
    "agreement before anybody signs it. You are that person. The platform's job is "
    "to make it impossible for that step to be skipped, bypassed or quietly "
    "invalidated by a later edit. Everything else in this guide follows from that "
    "division.")

g.table(
    ["The platform guarantees", "You supply"],
    [["A draft cannot reach a signature without an explicit approval.",
      "The professional judgement in the draft itself."],
     ["An approval is bound to one exact version and is cancelled by any redraft.",
      "Reading the version you are approving."],
     ["Every draft, approval and signature is audited with actor and timestamp.",
      "Advice to both parties on the consultation."],
     ["Use of a generation aid is recorded as a fact on the version.",
      "Never treating that aid as a substitute for review."]])

g.note("The platform does not give legal advice and neither does any automated part "
       "of it. There is no clause suggestion that auto-applies, no risk score, and "
       "no automated dispute outcome anywhere in the system. Where a drafting aid is "
       "used, the version records <code>drafted_with_ai</code> as a fact for the "
       "audit trail — it is a disclosure, not an endorsement.", kind="warn")

# ------------------------------------------------------------------- rules
g.h2("2. The two rules enforced in code")

g.h3("Rule one: an unapproved draft cannot be signed")
g.p("If an agreement has no recorded approval, the sign endpoint refuses it "
    "outright. Neither party can sign their way past a missing review, and no "
    "interface anywhere exposes a route around it.")

g.h3("Rule two: an approval belongs to one version")
g.p("When you approve, you approve a specific version number. If the draft is "
    "changed afterwards, the approval is cleared automatically and the agreement "
    "returns to review. Equally, if you open a draft, someone redrafts it while you "
    "are reading, and you then approve — the system refuses, because the version you "
    "reviewed is no longer the current one.")

g.note("These two rules together close the gap that matters: a document that was "
       "reviewed cannot be edited into something that was not, and then signed. "
       "You do not have to police this manually.", kind="tip")

# ------------------------------------------------------------------- queue
g.pagebreak()
g.h2("3. The case queue")

s = Screen()
s.appbar("Adv. Shalini Menon")


def body(b):
    b.gap(10)
    b.h1("Legal queue", 15)
    b.para("Every case here has real parties and real money attached.")
    b.gap(6)
    b.badges([("All open", "seal"), ("Intake", "neutral"), ("Document review", "neutral"),
              ("Consultation", "neutral"), ("Drafting", "neutral")])
    b.card("ODB-LGL-2026-000118 · 2 BHK apartment in Gachibowli",
           ["Gachibowli, Hyderabad · R. Reddy ⟷ Priya Sharma",
            "New agreement · Rent ₹28,000 · Deposit ₹1,12,000 · Telangana",
            "Opened 3 days ago · Assigned to nobody yet"],
           tone="ochre", note="INTAKE · HIGH PRIORITY")
    b.card("ODB-LGL-2026-000117 · 3 BHK villa in Kokapet",
           ["Kokapet, Hyderabad · S. Iyer ⟷ A. Nair",
            "New agreement · Rent ₹52,000 · Protected plan",
            "Opened 5 days ago · Assigned to Adv. Shalini Menon"],
           note="DRAFTING · AGREEMENT AWAITING APPROVAL")


s.sidebar_page(NAV_LEGAL, "Legal queue", body)
g.mock(s, "The legal case queue")

g.h3("How the queue is ordered")
g.p("Urgent first, then high, then normal, then low — and within each band, oldest "
    "first. A case that has been sitting for a week rises above one opened this "
    "morning at the same priority.")

g.table(
    ["Status", "Means"],
    [["Intake", "Case just opened by an accepted application. Nobody assigned."],
     ["Document review", "Assigned. Reading the KYC and property documents."],
     ["Consultation scheduled", "A video session is booked with both parties."],
     ["Drafting", "A version exists and is being worked on."],
     ["Approved", "A version has been approved and is out for signature."],
     ["Executed", "All parties have signed. Case closed."]])

# ------------------------------------------------------------------- case
g.h2("4. Opening a case")

g.step(1, "Assign it to yourself",
       "<p>From the case, choose <strong>Assign</strong> and set a priority. An "
       "unassigned case is nobody's responsibility, which is how cases go stale.</p>")

g.step(2, "Read the documents before anything else",
       "<p>The case detail brings together everything in one view: the tenancy "
       "terms, both parties' KYC status, the property record and every document "
       "attached to either. Read these before you draft a line.</p>")

g.step(3, "Check both parties are actually verified",
       "<p>The KYC panel shows each party's status. Drafting an agreement between "
       "parties whose identities have not been confirmed defeats the purpose of the "
       "platform.</p>")

g.step(4, "Note the jurisdiction",
       "<p>Set on the case. Stamp duty, registration requirements and the "
       "enforceability of specific clauses are state-specific. The clause library is "
       "tagged by jurisdiction for this reason.</p>")

s = Screen()
s.gap(10)
s.eyebrow("ODB-LGL-2026-000118")
s.h1("Case detail", 15)
s.datarows([("Property", "2 BHK apartment, Gachibowli"),
            ("Owner", "R. Reddy — KYC verified 04 Jun"),
            ("Tenant", "Priya Sharma — KYC verified 12 Jun"),
            ("Rent / deposit", "₹28,000 / ₹1,12,000"),
            ("Lock-in / notice", "6 months / 60 days"),
            ("Service plan", "Protected"),
            ("Jurisdiction", "Telangana")], title="Case summary")
s.buttons([("Schedule consultation", "primary"), ("Start draft", "secondary"),
           ("Add internal note", "ghost")])
g.mock(s, "A case in document review")

g.note("Internal notes are visible only to the legal team. Notes marked "
       "<em>Parties</em> are visible to the owner and tenant. Choose deliberately — "
       "the distinction is enforced, but only you know which one a given note should "
       "be.")

# ------------------------------------------------------------------ clauses
g.pagebreak()
g.h2("5. The clause library")

g.p("The library holds reviewed, versioned, jurisdiction-tagged clause templates "
    "with placeholders that are filled from the tenancy's actual numbers. Mandatory "
    "clauses are flagged and appear first.")

s = Screen()
s.gap(10)
s.h1("Clause library", 15)
s.badges([("Mandatory", "seal"), ("Payment", "neutral"), ("Termination", "neutral"),
          ("Maintenance", "neutral"), ("Use", "neutral")])
s.card("Rent and payment terms  ·  mandatory  ·  v2  ·  Telangana",
       ["The Licensee shall pay a monthly licence fee of INR {{rent_amount}} on or",
        "before the {{rent_due_day}} day of each calendar month..."], h=58)
s.card("Security deposit and refund  ·  mandatory  ·  v2",
       ["A refundable deposit of INR {{deposit_amount}} shall be returned within",
        "{{refund_days}} days of the Licensee vacating..."], h=58)
g.mock(s, "The clause library")

g.h3("Working with placeholders")
g.p("Placeholders in double braces are substituted at draft time from the tenancy "
    "record — rent, deposit, maintenance, lock-in, notice, rent due day. You can "
    "override any of them, and you can add variables of your own. A placeholder with "
    "no matching value is left visible in the output rather than silently rendering "
    "as blank, so an unfilled variable is obvious on review.")

g.h3("Adding a custom clause")
g.p("You can add clauses that are not in the library for a specific agreement; they "
    "are marked as custom on the version. If you find yourself writing the same "
    "custom clause repeatedly, it belongs in the library — raise it so it can be "
    "reviewed and versioned properly.")

# ----------------------------------------------------------------- drafting
g.h2("6. Drafting an agreement")

g.step(1, "Start the draft from the case",
       "<p>The first draft creates the agreement record, assigns it a number and "
       "registers both parties as signatories in signing order.</p>")

g.step(2, "Select clauses and set the variables",
       "<p>Mandatory clauses first, then whatever the consultation produced. "
       "Variables default from the tenancy but you can override them.</p>")

g.step(3, "Write a change summary",
       "<p>Optional on version one, valuable on every version after. Six months "
       "later, the summary is how anyone reconstructs why the deposit clause "
       "changed.</p>")

g.step(4, "Disclose a drafting aid if you used one",
       "<p>The <code>drafted_with_ai</code> flag is recorded on the version. It "
       "changes nothing about your obligation to review, and it costs nothing to "
       "set honestly.</p>")

g.note("Every redraft increments the version and clears any existing approval. The "
       "agreement returns to <strong>Legal review</strong>. This is not a bug to "
       "work around — it is the mechanism that makes approval meaningful.")

g.h3("What you cannot redraft")
g.p("An agreement that is already out for signature cannot be redrafted. Cancel it "
    "first. This prevents the situation where one party has signed a document and "
    "the other signs a different one.")

# ------------------------------------------------------------ consultation
g.pagebreak()
g.h2("7. The consultation")

g.p("Scheduling a consultation moves the case to <strong>Consultation "
    "scheduled</strong> and the tenancy to <strong>Consultation</strong>, and "
    "notifies both parties.")

s = Screen()
s.gap(10)
s.h1("Schedule a consultation", 15)
s.field_row([("Purpose", "Legal consultation", 240),
             ("Duration", "30 minutes", 160)])
s.gap(8)
s.field("Scheduled for", "18 Jun 2026, 4:00 PM")
s.field("Agenda",
        "Walk both parties through deposit, lock-in, notice and repairs.")
s.button("Schedule and notify parties", w=230)
g.mock(s, "Scheduling a consultation")

g.h3("What to cover")
g.ul([
    "The deposit: amount, and the refund window in days.",
    "Lock-in and notice, and what happens if either party breaks them.",
    "Who bears which repair costs, with a workable boundary rather than a vague one.",
    "Rent escalation on renewal, if any.",
    "What happens if the property is sold during the tenancy.",
    "The condition report: explain that it exists and why it protects both of them.",
])

g.step(1, "Record the outcome",
       "<p>After the call, use <strong>Complete meeting</strong> and write the "
       "outcome notes. This is the record of what was agreed, and it is what the "
       "draft is then written against.</p>")

g.step(2, "Draft to match what was agreed",
       "<p>If the parties settled on a thirty-day refund window, the clause says "
       "thirty days. A draft that quietly differs from the call is the fastest way "
       "to lose both parties' trust in the process.</p>")

g.note("You are advising both parties at once, and you are not either party's "
       "personal counsel. Say so on the call. Where one side's interests would be "
       "better served by independent advice — an unusual lock-in, a corporate "
       "counterparty, a high-value deposit — tell them that plainly.", kind="warn")

# ---------------------------------------------------------------- approval
g.h2("8. Approving a version")

s = Screen()
s.gap(10)
s.eyebrow("ODB-AGR-2026-000001 · version 2")
s.h1("Leave and Licence Agreement", 15)
s.badges([("Legal review", "ochre")])
s.card("Change summary (version 2)",
       ["Refund window reduced from 45 to 30 days per consultation on 18 Jun.",
        "Maintenance responsibility clause split between structural and consumable."],
       h=52)
s.datarows([("Drafted by", "Adv. Shalini Menon"),
            ("Drafted with an aid", "No"),
            ("Current version", "2"),
            ("Approval status", "Not approved")], title="Version")
s.buttons([("Approve version 2", "primary"), ("Redraft", "secondary")])
g.mock(s, "A version awaiting approval")

g.p("Approving sets the agreement to <strong>Awaiting signatures</strong>, records "
    "you as the approver with a timestamp, and notifies both parties that there is "
    "something to sign.")

g.note("If the approve action is refused with a message about the draft having "
       "changed, that is rule two working. Someone redrafted while you had it open. "
       "Reload, read the new version, and approve that.")

g.h3("Separation of duties")
g.p("Drafting and approval are separate permissions precisely so they can be held by "
    "different people. In production they should be. One person drafting and "
    "approving their own work is permitted by the system but is not what the "
    "permission split is for.")

# --------------------------------------------------------------- execution
g.h2("9. Signature and execution")

g.p("Parties sign in order. The agreement moves to <strong>Partially signed</strong> "
    "after the first signature and <strong>Executed</strong> only when the last one "
    "lands. Each signature records a timestamp, an IP address and the consent text "
    "the party accepted.")

g.p("On execution, the platform automatically: closes the legal case, moves the "
    "tenancy to <strong>Awaiting payment</strong>, raises the deposit and first "
    "month on the ledger, writes the event to the property timeline, and notifies "
    "both parties.")

g.note("With no e-signature provider configured, a signature is recorded as a "
       "click-wrap consent with timestamp and IP. The agreement page states this "
       "plainly rather than implying a qualified digital signature. If your "
       "deployment requires more, that is a provider integration, not a UI "
       "change.", kind="warn")

# ---------------------------------------------------------------- disputes
g.pagebreak()
g.h2("10. Disputes")

g.p("The legal team holds the dispute management permission. A dispute arrives with "
    "a category, a claimed amount if any, and whatever evidence the parties have "
    "attached — condition reports, payment records, maintenance tickets, documents.")

g.h3("How to work one")
g.ol([
    "Read the record before either party's account of it. The condition reports and "
    "the payment ledger are contemporaneous; the submissions are not.",
    "Move the status to <strong>Under review</strong> so both parties can see it is "
    "being worked.",
    "Ask for specific missing evidence rather than a general response.",
    "Propose a resolution and record it in full.",
    "Close it only when both parties have responded to the proposal.",
])

g.note("<strong>You facilitate; you do not adjudicate.</strong> Odibrick has no "
       "authority to compel either party, and nothing in the system makes an "
       "automated determination. The move-out comparison carries an explicit note "
       "that it is a record and not a determination of liability — do not undercut "
       "that by presenting a resolution as a ruling. Either party's remedies through "
       "the rent authority or the courts are unaffected, and where a matter clearly "
       "belongs there, say so.", kind="warn")

# ------------------------------------------------------------------ limits
g.h2("11. What the platform will not do")

g.table(
    ["It will not", "Because"],
    [["Auto-approve a draft",
      "Approval is an act of professional judgement and is recorded against a named "
      "person."],
     ["Let a signature onto an unapproved or stale version",
      "Enforced in the service layer, not the interface."],
     ["Compute or pay stamp duty",
      "State-specific and outside the platform's scope. The stamping status is "
      "tracked; the duty is not paid."],
     ["Register an agreement",
      "An executed agreement here is a signed document, not a registered one. The "
      "interface says so on the agreement page."],
     ["Decide a dispute",
      "No automated outcome exists anywhere in the system."],
     ["Give either party personal legal advice",
      "You advise both parties on the document. That is not the same thing, and it "
      "is worth saying out loud on the call."]])

g.h2("Where to get help")
g.p("Platform problems go through a support ticket. Questions of legal substance are "
    "for your own professional judgement and your firm's supervision — the platform "
    "supports your process, it does not supervise it.")

g.build("/home/claude/guides/out/Odibrick-Legal-Team-Guide.pdf")
print("legal guide built")
