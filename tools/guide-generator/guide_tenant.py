from builder import Guide
from mockup import Screen, NAV_TENANT

g = Guide(
    role="Tenant",
    title="Renting a home\non Odibrick",
    lede=("From your first search to the day you get the keys — and everything that "
          "protects your deposit afterwards."),
    audience="Anyone looking to rent a home through Odibrick",
)

# ---------------------------------------------------------------- contents
g.h2("What is in this guide")
g.toc([
    "Before you start — what makes Odibrick different",
    "Creating your account",
    "Verifying your identity",
    "Searching for a home",
    "Reading a property page",
    "Asking a question, and applying",
    "The legal consultation",
    "Reading and signing the agreement",
    "Paying the deposit and first month",
    "The Day 1 condition report — the most important step",
    "Living there: rent, maintenance, messages",
    "Moving out and getting your deposit back",
    "If something goes wrong",
    "Common questions",
])

g.h2("1. Before you start")
g.p("Odibrick is not a listings board. On most portals you find a phone number and "
    "everything after that is your own problem. Here the platform stays involved "
    "through the whole transaction, and the reason is simple: most rental disputes "
    "are arguments about what was agreed and what condition the flat was in. Both "
    "of those are solvable by writing things down at the time.")

g.p("So the journey has six stages, and you can always see which one you are in.")

s = Screen()
s.gap(10)
s.eyebrow("The six stages of every Odibrick tenancy")
s.journey(["Apply", "Verify", "Legal review", "Agreement", "Payment", "Check-in"], 6)
s.gap(4)
g.mock(s, "The journey bar, shown on every property page and tenancy")

g.h3("What this means for you in practice")
g.table(
    ["What you get", "Why it matters"],
    [["A verification seal you can trust",
      "A badge appears only when our team has actually checked that item. "
      "No badge means we have not checked it — not that something is wrong."],
     ["A lawyer-reviewed agreement",
      "A qualified professional drafts and approves the document before anyone signs. "
      "You get a video call to ask what the clauses actually mean."],
     ["A payment ledger with references",
      "Every rupee has a reference number, a due date and a receipt. Nothing is "
      "marked paid without a bank or gateway reference behind it."],
     ["A Day 1 condition record",
      "You photograph the flat room by room when you move in. Both parties "
      "acknowledge it. That record is what a deposit deduction gets checked against "
      "a year later."]])

g.note("Odibrick never holds your money. Rent and deposit go directly to the owner "
       "or through a licensed payment provider. What Odibrick keeps is the "
       "<em>record</em> that the payment happened.")

# ------------------------------------------------------------------ signup
g.pagebreak()
g.h2("2. Creating your account")

g.step(1, "Open the site and choose Create account",
       "<p>From the homepage, select <strong>List a property</strong> in the top "
       "right — the same page handles every account type — or go straight to "
       "<code>/register</code>.</p>")

s = Screen()
s.browser("odibrick.com/register")
s.gap(12)
s.eyebrow("Tenant account")
s.h1("Create your account")
s.para("Already registered?  Sign in")
s.gap(6)
s._text(14, s.y + 9, "I want to", 8.5)
s.y += 16
x = s.badge("Rent a home", "seal", x=14, inline=True)
x = s.badge("List my property", "neutral", x=x, inline=True)
x = s.badge("I am an agent", "neutral", x=x, inline=True)
s.badge("I am a builder", "neutral", x=x)
s.gap(6)
s.field("Full name", "Priya Sharma")
s.field("Email", "priya@example.com", w=230)
s.field("Password", "••••••••••••", w=230, hint="At least 10 characters. Currently strong.")
s.gap(2)
s.para("[x]  I accept the terms of use and privacy policy")
s.gap(4)
s.button("Create account", w=200)
g.mock(s, "Registration — choose 'Rent a home' as your account type")

g.step(2, "Pick the right account type",
       "<p>Select <strong>Rent a home</strong>. This gives you a tenant account. "
       "If you later want to list a property too, support can add that role to your "
       "existing account — you do not need a second one.</p>")

g.step(3, "Use a real email address",
       "<p>Notifications about your application, your agreement and your payments "
       "all arrive here. Use an address you actually check.</p>")

g.step(4, "Choose a strong password",
       "<p>Ten characters minimum. The strength indicator under the field tells you "
       "where you stand. This account will hold your identity documents and your "
       "tenancy agreement, so it is worth a password you do not use anywhere else.</p>")

g.note("Staff roles cannot be created from this form. Selecting a tenant, owner, "
       "agent or builder account is the only option, by design.", kind="note")

# --------------------------------------------------------------------- kyc
g.pagebreak()
g.h2("3. Verifying your identity")

g.p("You cannot apply for a home until your identity is verified. This is not "
    "bureaucratic friction — it is the reason owners on this platform take "
    "applications seriously, and the reason the badge on <em>their</em> listing "
    "means something to you.")

g.step(1, "Go to Identity in your dashboard",
       "<p>Sign in, then choose <strong>Identity</strong> under Account in the left "
       "navigation. If you try to apply for a home first, Odibrick sends you here "
       "and explains why.</p>")

s = Screen()
s.appbar("Priya Sharma")


def body(b):
    b.gap(10)
    b.h1("Identity verification", 15)
    b.para("Both sides of every Odibrick tenancy are verified.")
    b.gap(2)
    b.callout("You need a verified identity before applying for a home.")
    b.card("Submit your details",
           ["Stored encrypted. Only the last four digits of your ID are ever",
            "shown back to anyone."], h=44)
    b.field("Full name, exactly as printed on the document", "Priya Sharma")
    b.field("Document", "Aadhaar", w=120)
    b.field("Document number", "•••• •••• 4821", w=200,
            hint="Encrypted before it is stored.")
    b.field("Scan or photograph of the document", "aadhaar-front.jpg")
    b.button("Submit for verification", w=180)


s.sidebar_page(NAV_TENANT, "Identity", body)
g.mock(s, "The identity verification form")

g.step(2, "Enter your name exactly as printed",
       "<p>If your ID says <em>Priya S Sharma</em> and you type <em>Priya Sharma</em>, "
       "the reviewer has to reject it. Match the document character for character.</p>")

g.step(3, "Choose your document and enter the number",
       "<p>Aadhaar, PAN, passport, driving licence or voter ID. The number is "
       "encrypted before it is stored, and no screen anywhere in Odibrick will ever "
       "display it back in full — only the last four digits.</p>")

g.step(4, "Upload a legible scan",
       "<p>JPEG, PNG or PDF up to 10 MB. Make sure all four corners are visible and "
       "the text is readable. A blurred photo taken at an angle is the single most "
       "common reason a submission comes back rejected.</p>")

g.step(5, "Wait for a person to review it",
       "<p>This is a human reading your document, not an automated check, so it "
       "usually takes one to two working days. You will be notified either way. "
       "While it is pending, your dashboard shows <em>Identity verification in "
       "progress</em>.</p>")

s = Screen()
s.gap(12)
s.seal("Verified", "12 Jun 2026")
s.h2("Your identity is verified")
s.para("Reviewed by our team on 12 June 2026. You can now apply for homes.")
s.gap(6)
g.mock(s, "Once approved, the ochre seal appears on your Identity page")

g.note("Ochre is used for one thing only across the whole platform: something that "
       "has actually been verified. If you see that colour, a person checked it.",
       kind="tip")

# ------------------------------------------------------------------ search
g.h2("4. Searching for a home")

s = Screen()
s.browser("odibrick.com/properties?city=Hyderabad")
s.appbar("Priya Sharma")
s.gap(8)
s.h1("Homes for rent in Hyderabad", 15)
s.para("48 homes match your filters")
s.gap(4)
s.field_row([("Monthly rent (min)", "20,000", 120), ("Max", "45,000", 120)])
s.gap(6)
s._text(14, s.y + 8, "BEDROOMS", 6.5, "#5B6B63", "DejaVu Sans Mono", spacing="1.4")
s.y += 14
x = s.badge("1+ BHK", "neutral", x=14, inline=True)
x = s.badge("2+ BHK", "seal", x=x, inline=True)
x = s.badge("3+ BHK", "neutral", x=x, inline=True)
s.badge("4+ BHK", "neutral", x=x)
s.gap(2)
s._text(14, s.y + 8, "TRUST", 6.5, "#5B6B63", "DejaVu Sans Mono", spacing="1.4")
s.y += 14
s.para("[x] Documents verified      [ ] Odibrick Protected")
s.para("[x] Available now           [ ] Pets allowed")
g.mock(s, "Search filters — the Trust group is unique to Odibrick")

g.h3("The filters worth understanding")
g.table(
    ["Filter", "What it actually does"],
    [["Documents verified",
      "Shows only listings where our team has checked the ownership papers. "
      "Fewer results, but every one has been looked at."],
     ["Odibrick Protected",
      "The owner has taken the Protected plan, which includes condition reports, "
      "legal support and eligible partner insurance products."],
     ["Available now",
      "Move-in date is today or earlier. Useful if you are on a deadline."],
     ["Listed by",
      "Owner, agent or builder. Some people prefer dealing directly with an owner; "
      "agents often have more inventory."],
     ["Pets allowed",
      "Filters on the owner's stated position. Confirm it in the agreement — a "
      "listing preference is not a binding term until it is written into the "
      "document."]])

g.note("Rent, deposit and maintenance are three separate numbers. A flat at "
       "₹28,000 with ₹1,12,000 deposit and ₹3,000 maintenance costs you ₹1,43,000 "
       "on day one and ₹31,000 a month. The property page shows all three, plus a "
       "total move-in cost.", kind="tip")

# ------------------------------------------------------------ property page
g.pagebreak()
g.h2("5. Reading a property page")

s = Screen()
s.browser("odibrick.com/india/hyderabad/gachibowli/2bhk-apartment-01hxyz")
s.appbar("Priya Sharma")
s.photo("Property photographs", h=90)
s.badges([("Rent", "neutral"), ("Apartment", "neutral"), ("Odibrick Protected", "ochre")])
s.h1("2 BHK apartment in Gachibowli", 15)
s.para("Gachibowli, Hyderabad 500032")
s.gap(2)
s._text(14, s.y + 20, "₹28,000", 20, "#12211C", "DejaVu Sans", weight="bold")
s._text(96, s.y + 20, "per month", 9, "#5B6B63")
s._text(180, s.y + 20, "Deposit  ₹1,12,000", 9, "#5B6B63")
s.y += 32
s.gap(2)
s.h2("What has been verified")
s.badges([("KYC verified", "seal"), ("Owner verified", "seal"),
          ("Documents verified", "seal"), ("Address verified", "seal")])
g.mock(s, "The top of a property page — price, deposit and verification seals")

g.h3("Check these five things before you enquire")

g.step(1, "The verification seals",
       "<p>Four seals is a fully checked listing: identity, owner, ownership "
       "documents and address. Fewer seals is not a warning sign on its own — it "
       "means we have not confirmed those items ourselves, and the page says so "
       "plainly rather than leaving a gap you might read as approval.</p>")

g.step(2, "The move-in cost box",
       "<p>On the right-hand side. First month plus deposit, totalled. Odibrick "
       "service fees are billed separately and shown before you commit to "
       "anything.</p>")

g.step(3, "Lock-in and notice period",
       "<p>In the Details table. Lock-in is how long you cannot leave without "
       "penalty; notice is how much warning you must give. Six months and sixty "
       "days are common. Both are negotiable, and the legal consultation is where "
       "you negotiate them.</p>")

g.step(4, "The property record",
       "<p>Near the bottom of the page. A timestamped list of everything Odibrick "
       "has recorded about this property — when it was listed, when it was verified, "
       "previous tenancies. A property with history is a property you can check.</p>")

g.step(5, "What the address does not tell you",
       "<p>Search results and public pages show the locality, not the exact "
       "address. You get the full address once the owner accepts your application. "
       "This protects the current occupants, and it will protect you too once you "
       "live there.</p>")

s = Screen()
s.gap(10)
s.eyebrow("Property record")
s.spine([
    ("Listing created", "02 Jun 2026 · 10:12", "done"),
    ("Ownership document verified", "03 Jun 2026 · 14:40", "done"),
    ("Listing published", "03 Jun 2026 · 16:02", "done"),
])
g.mock(s, "The record spine — every property has one")

# --------------------------------------------------------------- enquire
g.pagebreak()
g.h2("6. Asking a question, and applying")

g.p("There are two buttons on a property page and they do quite different things.")

s = Screen()
s.gap(10)
s.card("Listed by", ["Skyline Realty 2", "Agent · listed 03 Jun 2026"], h=42)
s.button("Start rental process", w=210)
s.button("Ask a question first", "secondary", w=210)
s.para("Enquiries and visits run through Odibrick so there is a record")
s.para("of who asked for what, and when.")
g.mock(s, "The action panel on a property page")

g.h3("Ask a question first")
g.p("Sends an enquiry. Low commitment, no identity requirement beyond having an "
    "account. Use it for anything you need to know before committing: is the "
    "deposit negotiable, when can I visit, is the water supply reliable.")

g.h3("Start rental process")
g.p("Submits a formal application. This needs verified identity, and it puts real "
    "information in front of the owner: how many people will live there, your "
    "preferred move-in date, how long you want to stay.")

s = Screen()
s.gap(10)
s.field("Preferred move-in date", "01 Jul 2026", w=200)
s.field_row([("Occupants", "2", 110), ("Months", "11", 110)])
s.gap(8)
s.field("Anything the owner should know",
        "Working couple, no pets, looking for a long stay.")
s.buttons([("Submit application", "primary"), ("Cancel", "secondary")])
s.para("Applying needs a verified identity.")
g.mock(s, "The application form")

g.step(1, "Be honest about occupants",
       "<p>If four people will live there, say four. An occupancy figure that turns "
       "out to be wrong on move-in day is a breach of the agreement you are about "
       "to sign, and it is a bad way to start a year-long relationship.</p>")

g.step(2, "Give a realistic move-in date",
       "<p>The owner plans around it, and it becomes the tenancy start date in the "
       "agreement.</p>")

g.step(3, "Write something in the message box",
       "<p>Owners receive several applications. Two sentences about who you are and "
       "why you want this particular flat does more work than you would expect.</p>")

g.step(4, "Track it under Applications",
       "<p>Your dashboard shows every application you have sent and its current "
       "status: submitted, under review, shortlisted, accepted or declined.</p>")

g.note("When an owner accepts your application, three things happen at once: a "
       "tenancy is created, a legal case is opened, and the listing is paused so "
       "nobody else applies. That is why acceptance is a considered step and not "
       "an instant reply.")

# ------------------------------------------------------------ consultation
g.pagebreak()
g.h2("7. The legal consultation")

g.p("Once your application is accepted, Odibrick's legal team schedules a video "
    "consultation with you and the owner together. This is the part of the process "
    "that does not exist anywhere else, and it is the part worth taking "
    "seriously.")

g.h3("What happens on the call")
g.ul([
    "A member of the legal team walks both parties through the terms — rent, "
    "deposit, lock-in, notice period, who pays for what repairs.",
    "You can ask what any clause actually means, in plain language.",
    "Anything the two of you agree on is written into the draft afterwards.",
    "The outcome is recorded as a note on the case, so there is no argument later "
    "about what was said.",
])

g.h3("Five things worth asking about")
g.table(
    ["Ask about", "Why"],
    [["The deposit refund window",
      "How many days after move-out must the owner return it? Thirty is common. "
      "Get a number into the document."],
     ["Who pays for what repairs",
      "The usual split is that the owner covers structural and appliance failure, "
      "the tenant covers consumables and damage. Agree the boundary now."],
     ["Lock-in versus notice",
      "If you might be transferred for work, a six-month lock-in matters. Say so."],
     ["Rent escalation on renewal",
      "Many agreements build in an annual increase. Know the number before you sign, "
      "not eleven months later."],
     ["What happens if the owner sells",
      "It is worth knowing where you stand."]])

g.note("The legal team drafts and advises. They do not represent you personally, "
       "and nothing on the call is a substitute for your own lawyer if the stakes "
       "warrant one. What the consultation gives you is a qualified professional "
       "explaining the document to both parties at the same time, which removes a "
       "great deal of the asymmetry from a rental negotiation.", kind="warn")

# --------------------------------------------------------------- agreement
g.pagebreak()
g.h2("8. Reading and signing the agreement")

g.p("You will be notified when the agreement is ready. It reaches you only after a "
    "qualified member of the legal team has approved that exact version — the "
    "system will refuse a signature on a draft that has not been approved.")

s = Screen()
s.appbar("Priya Sharma")
s.gap(8)
s.eyebrow("ODB-AGR-2026-000001")
s.h1("Leave and Licence Agreement", 15)
s.badges([("Awaiting signatures", "ochre")])
s.callout("Draft. This document is not in force until every party has signed "
          "and it is executed.")
s.datarows([("Rent", "₹28,000 / month"), ("Deposit", "₹1,12,000"),
            ("Lock-in", "6 months"), ("Notice", "60 days"),
            ("Approved by", "Adv. Shalini Menon")], title="Key terms")
s.h2("Signatories")
s.table(["Party", "Name", "Status"],
        [["Owner", "R. Reddy", "Signed"], ["Tenant", "Priya Sharma", "Pending"]],
        widths=[70, 130, 90])
g.mock(s, "An agreement awaiting your signature")

g.step(1, "Read the whole thing",
       "<p>It is not long. The clauses come from a reviewed library and are written "
       "to be readable. If a clause does not make sense, that is a reason to ask, "
       "not a reason to scroll past.</p>")

g.step(2, "Check the numbers against what you agreed",
       "<p>Rent, deposit, maintenance, lock-in, notice period, start and end dates. "
       "If the consultation produced a different number to the one on screen, stop "
       "and raise it before signing.</p>")

g.step(3, "Note who approved it",
       "<p>The page names the legal professional who approved this version. If the "
       "document is redrafted after approval, the approval is cancelled "
       "automatically and it must be reviewed again — a post-approval edit cannot "
       "reach your signature.</p>")

g.step(4, "Sign",
       "<p>Tick the consent box and confirm. Your signature is recorded with a "
       "timestamp and your IP address.</p>")

g.step(5, "Wait for it to be executed",
       "<p>The agreement becomes <strong>Executed</strong> only when every party has "
       "signed. Until then the page says plainly that it is a draft and not in "
       "force. Once executed, an ochre <em>Executed</em> seal appears with the "
       "date.</p>")

g.note("An executed agreement in Odibrick is a signed document. It is not a "
       "<em>registered</em> one — stamp duty and registration are state-specific "
       "and are handled separately. The platform tracks the stamping status but "
       "does not pay duty on your behalf.", kind="warn")

# ---------------------------------------------------------------- payment
g.pagebreak()
g.h2("9. Paying the deposit and first month")

g.p("The moment the agreement is executed, your move-in dues appear on the ledger "
    "with a reference number each.")

s = Screen()
s.appbar("Priya Sharma")


def body(b):
    b.gap(10)
    b.h1("Payments", 15)
    b.para("Every entry has a reference number and a transaction trail.")
    b.gap(4)
    b.card("Due now", [
        "Security deposit    ODB-PAY-2026-000412    ₹1,12,000    [Pay now]",
        "Advance rent        ODB-PAY-2026-000413    ₹28,000      [Pay now]",
    ], h=62)
    b.callout("Odibrick marks a payment paid only when the credit is confirmed — "
              "never on your say-so alone.")


s.sidebar_page(NAV_TENANT, "Payments", body)
g.mock(s, "The payment ledger showing move-in dues")

g.step(1, "Select Pay now",
       "<p>Odibrick either opens a licensed payment provider, or — if online "
       "collection is not enabled — gives you bank transfer instructions with a "
       "reference to quote.</p>")

g.step(2, "Quote the reference",
       "<p>If you are transferring directly, put the reference code "
       "(<code>ODB-PAY-2026-000412</code>) in the transfer narration. It is how the "
       "credit gets matched to your tenancy.</p>")

g.step(3, "Wait for confirmation",
       "<p>The entry moves to <strong>Paid</strong> only when the provider confirms "
       "it or an Odibrick operator matches it against the bank statement. The system "
       "will not mark it paid because you say you paid — which is the same "
       "protection working in your favour when a landlord claims you did not.</p>")

g.step(4, "Keep the receipt",
       "<p>Once settled, the receipt is in your document vault. Every payment "
       "carries its bank or gateway reference, permanently.</p>")

g.note("When both the deposit and the first month clear, your tenancy moves "
       "automatically to <strong>Check-in pending</strong> and a task appears on "
       "your dashboard.")

# ---------------------------------------------------------- condition report
g.pagebreak()
g.h2("10. The Day 1 condition report")

g.note("This is the single most valuable thing you will do on Odibrick. Ten "
       "minutes of photography on the day you get the keys is what stands between "
       "you and an argument about your deposit eleven months from now. Do it "
       "before you move any furniture in.", kind="tip", label="Read this twice")

s = Screen()
s.appbar("Priya Sharma")
s.gap(8)
s.eyebrow("Day 1 condition report · ODB-CR-2026-000001")
s.h1("Kitchen", 15)
s.badges([("3 photos", "ochre")])
s.card("Walls", ["Condition:   New   Good   Fair   Damaged   Missing"], h=42)
s.card("Appliances",
       ["Condition:   New   Good   [Fair]   Damaged   Missing",
        "Damage type: Wear      Notes: Chimney filter needs cleaning."], h=54)
s.field("Photographs of the kitchen", "IMG_2041.jpg, IMG_2042.jpg",
        hint="We record both your device's time and the time the file reaches us.")
s.buttons([("Previous room", "secondary"), ("Next room", "primary"),
           ("Save progress", "ghost")])
g.mock(s, "The condition report wizard, one room at a time")

g.h3("How to do it properly")

g.step(1, "Start the report the day you get the keys",
       "<p>From your dashboard task or the tenancy page. The report walks you "
       "through seven rooms — entrance, living room, kitchen, bedroom, bathroom, "
       "balcony, utility — and the elements in each.</p>")

g.step(2, "Rate honestly, including things that are fine",
       "<p>Marking everything <em>Damaged</em> is as useless as marking everything "
       "<em>New</em>. A credible record is one that mostly says <em>Good</em> and "
       "specifically flags the four things that are not.</p>")

g.step(3, "Photograph every single defect",
       "<p>A scratch you noted but did not photograph is a claim. A scratch you "
       "photographed is a record. Get close enough that the damage is unmistakable, "
       "and take a wider shot showing where in the room it is.</p>")

g.step(4, "Record the meter readings",
       "<p>Electricity, water and gas, on the last screen. This prevents you "
       "inheriting someone else's bill.</p>")

g.step(5, "Submit — and understand that it locks",
       "<p>You need at least five items and five photographs. Once submitted the "
       "report cannot be edited. That immutability is exactly what makes it useful "
       "as evidence, so take the extra ten minutes before you submit.</p>")

g.step(6, "The owner acknowledges it",
       "<p>They review and either agree or flag a disagreement. When both parties "
       "have acknowledged, the report is sealed and your tenancy becomes "
       "<strong>Active</strong>.</p>")

s = Screen()
s.gap(10)
s.seal("Acknowledged", "Both parties")
s.para("Both parties have accepted this record. It is the reference point for any")
s.para("deposit question at the end of the tenancy.")
s.gap(6)
g.mock(s, "A fully acknowledged condition report")

g.h3("A short checklist for photographers")
g.ul([
    "Shoot in daylight if you can. Phone flash flattens detail.",
    "Every wall of every room, plus the ceiling if there are stains.",
    "Inside cupboards and under the sink — leaks start where nobody looks.",
    "Close-ups of every scratch, crack, stain, dent and chip.",
    "All appliances, switched on, to show they work.",
    "The meters, close enough to read the digits.",
    "Window and door frames, and the state of the paint around them.",
])

# --------------------------------------------------------------- occupancy
g.pagebreak()
g.h2("11. Living there")

g.h3("Rent")
g.p("Monthly rent appears on your ledger with a due date. Pay it the same way you "
    "paid the first month, quoting the reference. Your payment history builds up as "
    "a record, which is useful the next time you rent anywhere.")

g.h3("Maintenance requests")
g.p("Raise these from the tenancy page rather than by phone. A request in the "
    "system has a ticket number, a timestamp, a status and a photograph — which "
    "matters if the same leak is still unfixed six weeks later.")

s = Screen()
s.gap(10)
s.field("Category", "Plumbing", w=150)
s.field("Priority", "Normal", w=150,
        hint="Use Emergency only for something actively causing damage.")
s.field("Title", "Kitchen sink drains slowly")
s.field("Description", "Water pools for about a minute after use.")
s.button("Raise request", w=150)
g.mock(s, "Raising a maintenance request")

g.table(
    ["Priority", "Use it for"],
    [["Emergency", "Active water ingress, electrical danger, no water, "
                   "security failure — something causing damage right now."],
     ["High", "No hot water, a failed appliance you depend on, a leak that is "
              "contained but worsening."],
     ["Normal", "Most things. A slow drain, a flickering light, a sticking door."],
     ["Low", "Cosmetic. Worth recording, not worth an urgent call-out."]])

g.h3("Your tenancy record")
g.p("Every event — the agreement, each payment, each maintenance request, the "
    "condition report — is added to the tenancy's record spine with a timestamp. "
    "Both you and the owner see the same list. Nothing is reconstructed from memory "
    "later.")

s = Screen()
s.gap(10)
s.eyebrow("Tenancy record")
s.spine([
    ("Tenant selected", "10 Jun 2026 · 11:20", "done"),
    ("Agreement executed", "12 Jun 2026 · 11:44", "done"),
    ("Move-in payments completed", "13 Jun 2026 · 04:02", "done"),
    ("Day 1 condition report submitted", "15 Jun 2026 · 13:20", "done"),
    ("Maintenance: kitchen sink", "02 Aug 2026 · 09:15", "current"),
])
g.mock(s, "A tenancy record spine partway through the year")

# --------------------------------------------------------------- move out
g.pagebreak()
g.h2("12. Moving out and getting your deposit back")

g.step(1, "Give notice in writing, through the platform",
       "<p>Check your notice period in the agreement — sixty days is common. Serve "
       "it from the tenancy page so the date is recorded. A WhatsApp message is not "
       "a record.</p>")

g.step(2, "Fix what you broke",
       "<p>Between notice and move-out you have time to repair anything that is "
       "genuinely your damage. It is almost always cheaper than a deduction.</p>")

g.step(3, "File the move-out condition report",
       "<p>Same wizard, same rooms. Odibrick automatically compares it against your "
       "Day 1 record, element by element.</p>")

s = Screen()
s.gap(10)
s.card("Compared with the Day 1 record",
       ["2 items changed, 34 unchanged", "",
        "Kitchen · Appliances        Fair  →  Damaged",
        "Bathroom · Fixtures         Fair  →  Damaged"], h=76)
s.callout("This comparison is a record, not a determination of liability. Deposit "
          "deductions are agreed between the parties or decided through the "
          "dispute process.")
g.mock(s, "The automatic move-out comparison")

g.note("Read that callout carefully, because it protects you. Odibrick produces the "
       "diff; it does not rule on who owes what. Fair wear and tear over a year is "
       "not damage, and a comparison showing deterioration is the beginning of a "
       "conversation, not the end of one.", kind="warn")

g.step(4, "Agree the deductions, or dispute them",
       "<p>If the owner proposes a deduction you accept, the deposit is returned "
       "less that amount and the payment is recorded. If you disagree, open a "
       "dispute.</p>")

g.step(5, "The deposit is returned and recorded",
       "<p>The refund appears on your ledger with its bank reference, like every "
       "other payment.</p>")

# ---------------------------------------------------------------- disputes
g.h2("13. If something goes wrong")

g.h3("Opening a dispute")
g.p("From the tenancy page, choose <strong>Open a dispute</strong>. Pick a "
    "category — deposit, property damage, maintenance, payment, agreement, notice "
    "period or access — state the amount if money is involved, and summarise the "
    "problem.")

g.h3("Attach your evidence")
g.p("This is where the last twelve months of record-keeping pays off. You can "
    "attach your condition reports, payment records, maintenance tickets and "
    "documents directly. A dispute backed by a timestamped Day 1 photograph is a "
    "very different conversation from one backed by recollection.")

g.note("Odibrick's disputes team reviews the record and helps both parties reach a "
       "resolution. <strong>They do not adjudicate.</strong> No automated decision "
       "is made anywhere in this process, and Odibrick has no authority to compel "
       "either party. If the matter cannot be resolved, your legal remedies through "
       "the rent authority or the courts are entirely unaffected.", kind="warn")

g.h3("Support tickets")
g.p("For anything that is not a dispute with the other party — a problem with the "
    "platform, a question about your account, a document that will not upload — "
    "raise a support ticket under Account.")

# --------------------------------------------------------------------- faq
g.pagebreak()
g.h2("14. Common questions")

g.faq([
    ("Does Odibrick hold my deposit?",
     "No. Odibrick is non-custodial by default — your money goes directly to the "
     "owner or through a licensed payment provider. What Odibrick keeps is the "
     "record that the payment happened, with its reference."),
    ("Can I apply for more than one home at a time?",
     "Yes. Each application is tracked separately under Applications. Owners cannot "
     "see your other applications."),
    ("What if the owner never responds?",
     "Applications and enquiries are timestamped. If a listing goes stale, its "
     "response rate is visible to our team, and you can raise a support ticket."),
    ("Is my Aadhaar number safe?",
     "It is encrypted before it is stored, and no screen in the platform ever "
     "displays it in full — only the last four digits, to anyone, including staff. "
     "Every access to your documents is logged."),
    ("Why can I not see the full address before applying?",
     "It protects whoever currently lives there. You get the exact address as soon "
     "as the owner accepts your application, and the same protection applies to you "
     "once you move in."),
    ("Can I edit my condition report after submitting it?",
     "No. Immutability is what makes it credible as evidence. If something is "
     "missing, note it in a maintenance request or raise it with the owner so it "
     "goes on the record another way."),
    ("What if I need to leave during the lock-in period?",
     "The agreement governs this. It typically means forfeiting some portion of the "
     "deposit or paying rent for the remaining lock-in. Read that clause before you "
     "sign, and negotiate it at the consultation if it worries you."),
    ("Does a missing verification seal mean the listing is fake?",
     "No. It means we have not checked that specific item. We would rather show you "
     "an honest gap than a badge that implies more than we know."),
    ("Who do I contact if I am locked out of my account?",
     "Raise it through the support page. There is no self-service password reset in "
     "this version of the platform."),
])

g.h2("Where to get help")
g.p("Support tickets are the fastest route and they create a record. From your "
    "dashboard: <strong>Account → Support</strong>. Include the reference code of "
    "whatever you are asking about — a payment reference, an agreement number, a "
    "ticket number — and if you saw an error message, the trace ID at the bottom "
    "of it.")

g.build("/home/claude/guides/out/Odibrick-Tenant-Guide.pdf")
print("tenant guide built")
