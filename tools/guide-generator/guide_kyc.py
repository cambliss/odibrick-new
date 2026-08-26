from builder import Guide
from mockup import Screen, NAV_KYC

g = Guide(
    role="Verification team",
    title="Identity and\nlisting verification",
    lede=("You decide what a badge on Odibrick means. This guide is about applying "
          "that judgement consistently."),
    audience="Odibrick verification staff reviewing KYC submissions and listings",
)

g.h2("What is in this guide")
g.toc([
    "Why this role matters more than it looks",
    "The identity queue",
    "Reviewing an identity submission",
    "Approving and rejecting, and how to word it",
    "The listing moderation queue",
    "Verifying a property",
    "Recording individual checks",
    "Fraud signals",
    "Handling data properly",
    "Edge cases",
])

# ------------------------------------------------------------------ stakes
g.h2("1. Why this role matters more than it looks")

g.p("A renter filters for <em>Documents verified</em> and sees eleven listings "
    "instead of forty. They then treat those eleven as safe. That inference is only "
    "sound if the badge means what it claims — and the badge means whatever your "
    "team decides it means, applied one submission at a time.")

g.p("The system supports you in two specific ways.")

g.table(
    ["Design decision", "What it does for you"],
    [["A badge is a database row, not a flag",
      "There is no boolean <code>is_verified</code> anyone can set optimistically. "
      "A seal exists only where a verification record says VERIFIED, with your name "
      "and a timestamp on it."],
     ["Missing checks are shown honestly",
      "A property page says which checks were <em>not</em> done rather than leaving "
      "a gap the reader might mistake for approval. You never have to approve "
      "something marginal to avoid an ambiguous display."],
     ["Rejections require a reason",
      "The system will not accept a rejection without one. This is a feature — it "
      "forces the reason to exist and be communicable."],
     ["Every decision is audited",
      "Actor, timestamp, IP and object. If a decision is ever questioned, the record "
      "shows who made it and when."]])

g.note("You are not judging whether someone seems trustworthy. You are confirming a "
       "narrow, checkable fact: does this document match this name, does this "
       "paperwork describe this property. Keep the question narrow and the decisions "
       "stay consistent.", kind="tip")

# ------------------------------------------------------------------- queue
g.pagebreak()
g.h2("2. The identity queue")

s = Screen()
s.appbar("Verification Desk")


def body(b):
    b.gap(10)
    b.h1("Identity queue", 15)
    b.para("18 submissions awaiting review · oldest first")
    b.gap(6)
    b.badges([("Submitted", "seal"), ("In review", "neutral"), ("Rejected", "neutral")])
    b.card("Priya Sharma · Tenant",
           ["Aadhaar ending 4821 · submitted 2 days ago",
            "Account created 10 Jun 2026 · applying for a property in Gachibowli"],
           tone="ochre", note="SUBMITTED")
    b.card("Ramesh Reddy · Owner",
           ["PAN ending 1729 · submitted 3 days ago",
            "Account created 02 Jun 2026 · 1 draft listing pending"],
           tone="ochre", note="SUBMITTED")


s.sidebar_page(NAV_KYC, "Identity queue", body)
g.mock(s, "The identity review queue")

g.p("The queue is ordered oldest first. People are blocked from applying or listing "
    "until you have decided, so age in the queue is real friction for a real "
    "person.")

# ------------------------------------------------------------------ review
g.h2("3. Reviewing an identity submission")

g.step(1, "Open the submission and the document",
       "<p>You see the declared legal name, the document type, the last four digits "
       "of the number, and a link to the uploaded scan in the vault.</p>")

g.step(2, "Check the name against the document, character by character",
       "<p>This is the whole job. <em>Priya S Sharma</em> on the document and "
       "<em>Priya Sharma</em> on the form is a mismatch. It is usually innocent, and "
       "it is still a mismatch — reject with a clear reason and they will resubmit "
       "in a minute.</p>")

g.step(3, "Check the document is legible and complete",
       "<p>All four corners visible, text readable, not cropped, not obscured by "
       "glare. A document you cannot read is a document you cannot verify.</p>")

g.step(4, "Check for obvious tampering",
       "<p>Mismatched fonts, misaligned text, inconsistent background texture, a "
       "photograph that does not sit naturally in the layout. You are not a forensic "
       "examiner — but obvious edits are obvious.</p>")

g.step(5, "Decide",
       "<p>Approve or reject. A rejection needs a reason, and the reason reaches the "
       "user.</p>")

s = Screen()
s.gap(10)
s.eyebrow("Identity submission")
s.h1("Priya Sharma", 15)
s.datarows([("Declared legal name", "Priya Sharma"),
            ("Document type", "Aadhaar"),
            ("Document number", "•••• •••• 4821"),
            ("Submitted", "12 Jun 2026, 09:14"),
            ("Account role", "Tenant"),
            ("Account created", "10 Jun 2026")], title="Submission")
s.photo("Uploaded document — opens from the vault", h=64)
s.buttons([("Approve", "primary"), ("Reject", "danger"), ("Request a better scan", "secondary")])
g.mock(s, "An identity submission under review")

g.note("The full document number is never shown to you, or to anyone. It is "
       "encrypted at rest and only the last four digits are ever displayed. You "
       "verify against the scan, not against a stored number — which is the correct "
       "way round.", kind="warn")

# ------------------------------------------------------------------ wording
g.pagebreak()
g.h2("4. Approving and rejecting")

g.h3("Wording a rejection")
g.p("The reason goes to the user. A specific reason gets a correct resubmission "
    "tomorrow; a vague one gets three more wrong attempts and a support ticket.")

g.table(
    ["Instead of", "Write"],
    [["Document rejected",
      "The name on your Aadhaar reads 'Priya S Sharma'. Please resubmit with your "
      "name entered exactly as printed."],
     ["Unclear image",
      "The bottom-left corner of the scan is cut off. Please upload a photograph "
      "showing all four corners of the document."],
     ["Invalid document",
      "The uploaded file is a utility bill. Please upload one of: Aadhaar, PAN, "
      "passport, driving licence or voter ID."],
     ["Try again",
      "The document number entered does not match the number visible on the scan. "
      "Please check and resubmit."]])

g.h3("When to approve")
g.p("Approve when the name matches, the document is a valid accepted type, the scan "
    "is legible and complete, and nothing about it looks edited. That is the whole "
    "test. Do not add conditions of your own — an inconsistent bar is worse than a "
    "low one, because nobody can predict it.")

g.h3("When you are unsure")
g.p("Use <strong>Request a better scan</strong> rather than approving on balance. It "
    "keeps the submission open, costs the user two minutes, and avoids you carrying "
    "a decision you were not comfortable with.")

# ------------------------------------------------------------- moderation
g.h2("5. The listing moderation queue")

s = Screen()
s.appbar("Verification Desk")


def body2(b):
    b.gap(10)
    b.h1("Verification queue", 15)
    b.para("7 listings awaiting review")
    b.gap(6)
    b.card("2 BHK apartment in Gachibowli",
           ["Listed by Ramesh Reddy (Owner) · identity verified 04 Jun",
            "Gachibowli, Hyderabad 500032 · ₹28,000/month · 9 photographs",
            "Submitted 2 days ago · completeness 92%"],
           tone="ochre", note="PENDING VERIFICATION")
    b.card("3 BHK apartment in Kondapur",
           ["Listed by Skyline Realty (Agent) · RERA TS/RERA/AG/1004",
            "Kondapur, Hyderabad 500084 · ₹34,000/month · 6 photographs",
            "Submitted 4 days ago · completeness 88%"],
           tone="ochre", note="PENDING VERIFICATION · DUPLICATE ADDRESS FLAG")


s.sidebar_page(NAV_KYC, "Verification queue", body2)
g.mock(s, "The listing moderation queue")

# ------------------------------------------------------------- verify prop
g.pagebreak()
g.h2("6. Verifying a property")

g.p("Four checks, each recorded separately. A listing can be published with some "
    "checks passed and others not — the property page shows exactly which, so "
    "partial verification is an honest outcome rather than a failure.")

g.table(
    ["Check", "What you are confirming", "Look at"],
    [["KYC", "The lister's own identity is verified.",
      "Their identity record. This should already be green before they could "
      "submit."],
     ["Owner identity", "The lister is the person entitled to let this property.",
      "The name on the ownership document against the name on their verified ID."],
     ["Ownership document", "The paperwork describes this property.",
      "Sale deed, property tax receipt, allotment letter or equivalent. Check the "
      "address on it against the listing."],
     ["Address", "The stated address is real and matches.",
      "The ownership document, the PIN code, and whether the photographs are "
      "consistent with the described building type."]])

g.h3("Checking the photographs")
g.ul([
    "Do they show the property described? A 2 BHK listing with photographs of a "
    "single room is not complete.",
    "Are they consistent with each other — same flooring, same fittings, same "
    "building?",
    "Do they look like stock photography or estate-agent catalogue images? Reverse "
    "image search if something feels too polished.",
    "Does the exterior shot match the described building type and floor count?",
])

g.step(1, "Approve or reject the listing",
       "<p>Approving publishes it. Rejecting requires a reason, which reaches the "
       "lister.</p>")

g.step(2, "Record each check separately",
       "<p>This is the step that creates the seals. Approving the listing and "
       "recording the checks are different actions — a published listing with no "
       "recorded checks shows no badges at all, which is correct but rarely what you "
       "intended.</p>")

s = Screen()
s.gap(10)
s.h1("Record verification checks", 15)
s.card("KYC", ["Lister's identity verified 04 Jun 2026"], tone="seal", h=40)
s.card("Owner identity",
       ["Name on sale deed matches verified PAN"], tone="seal", h=40)
s.card("Ownership document",
       ["Sale deed dated 12 Mar 2019, address matches listing"], tone="seal", h=40)
s.card("Address",
       ["PIN and locality consistent with the deed"], tone="seal", h=40)
s.buttons([("Save checks", "primary"), ("Approve and publish", "primary")])
g.mock(s, "Recording individual verification checks")

g.note("Record only what you actually checked. If the ownership document was not "
       "supplied, leave that check unrecorded — the property page will say the check "
       "was not completed, and that sentence is the honest one. Recording a check "
       "you did not perform is the single most damaging thing anyone in this role "
       "can do.", kind="warn")

# ---------------------------------------------------------------- fraud
g.h2("7. Fraud signals")

g.p("The platform surfaces three heuristics for a human to look at. None of them is "
    "enforced automatically, and none is evidence on its own.")

s = Screen()
s.gap(10)
s.h1("Fraud signals", 15)
s.card("Duplicate addresses",
       ["Plot 42, Sunrise Residency, 500084 — 2 active listings",
        "Properties #118 and #204, different listers"], tone="alert", h=52)
s.card("Rapid listing creation",
       ["Skyline Realty — 22 listings created in the last 24 hours"],
       tone="ochre", h=40)
s.card("Pricing far below the locality average",
       ["3 BHK in Jubilee Hills at ₹12,000 · locality average ₹64,000"],
       tone="alert", h=40)
g.mock(s, "Fraud signals awaiting human review")

g.table(
    ["Signal", "Innocent explanation", "Worth checking"],
    [["Duplicate address",
      "An owner and their agent both listed it, or two units in the same building "
      "were entered with the same address line.",
      "Whether both listers can produce ownership paperwork."],
     ["Rapid listing creation",
      "A legitimate agency onboarding its book.",
      "Whether the listings have real photographs and distinct addresses."],
     ["Price far below locality",
      "A genuinely distressed or unusual property, or a typo — ₹12,000 instead of "
      "₹1,20,000.",
      "Almost always worth one message to the lister before anything else."]])

g.note("A signal is a prompt to look, not a verdict. Suspending an account is a "
       "serious action with real consequences for someone's livelihood, and it is "
       "audited against your name. Ask first.")

# ------------------------------------------------------------------- data
g.pagebreak()
g.h2("8. Handling data properly")

g.p("You have access to other people's identity documents. A few rules follow from "
    "that, and they are not negotiable.")

g.ul([
    "<strong>Every document you open is logged</strong> — who, what, when. This is "
    "not surveillance of you; it is the protection users are promised, and it "
    "protects you too if an access is ever questioned.",
    "<strong>Open only what you need.</strong> Browsing documents unrelated to a "
    "submission in your queue has no legitimate purpose and leaves a record.",
    "<strong>Never download, screenshot, photograph or forward a document.</strong> "
    "The vault exists so these files stay in one controlled place.",
    "<strong>Never share a document number</strong> in a ticket, an email or a "
    "message. The system deliberately shows you only the last four digits — do not "
    "defeat that by transcribing what you can see on the scan.",
    "<strong>Aadhaar carries specific legal obligations in India.</strong> Treat it "
    "with more care than the others, not less.",
])

g.note("If a colleague asks you to look up someone's document for a reason outside "
       "your queue, decline and raise it. That request is either a mistake or "
       "something worse, and either way the answer is the same.", kind="warn")

# ------------------------------------------------------------------ edges
g.h2("9. Edge cases")

g.faq([
    ("The name differs only by an initial or a middle name.",
     "Reject with a specific reason. It is a two-minute fix for the user and it "
     "keeps the standard consistent. Do not exercise discretion here — an "
     "unpredictable bar is worse than a strict one."),
    ("The document is valid but the photograph is of a screen.",
     "Request a better scan. A photograph of a monitor showing a document is not a "
     "document, and it defeats any tampering check."),
    ("An agent is listing a property they do not own.",
     "That is what agent accounts are for. Verify the agent's own identity and their "
     "RERA registration. The owner-identity check should reflect what you could "
     "actually confirm — if you could not confirm the owner, do not record that "
     "check."),
    ("A builder is listing units in an unbuilt project.",
     "Legitimate. Check the RERA project registration rather than a sale deed, and "
     "confirm the possession date is stated."),
    ("The same property appears from an owner and from their agent.",
     "Usually innocent. Contact both, confirm the arrangement, and keep one listing "
     "so renters are not enquiring twice about the same flat."),
    ("A user resubmits the same rejected document unchanged.",
     "Reject again, and make the reason more concrete than last time. If it happens "
     "a third time, raise a support ticket so someone can talk to them."),
    ("Someone claims urgency and asks you to fast-track.",
     "The queue is oldest-first for a reason. Genuine urgency goes through your "
     "supervisor, not around the queue."),
    ("You are related to, or know, the person in a submission.",
     "Do not review it. Hand it to a colleague. Your decision is audited against "
     "your name and there is no upside to being the person who approved their "
     "cousin's listing."),
])

g.h2("Where to get help")
g.p("Ambiguous submissions go to your supervisor before a decision, not after. "
    "Platform problems go through a support ticket. When in doubt on an identity "
    "document, requesting a better scan is always available and always defensible.")

g.build("/home/claude/guides/out/Odibrick-Verification-Team-Guide.pdf")
print("verification guide built")
