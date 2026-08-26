from builder import Guide
from mockup import Screen, NAV_OWNER

g = Guide(
    role="Property owner",
    title="Listing and letting\nyour property",
    lede=("Free, unlimited listings. A verified tenant, a lawyer-drafted agreement, "
          "and a written record of your property's condition."),
    audience="Individuals letting out one or more properties",
)

g.h2("What is in this guide")
g.toc([
    "The commercial deal, stated plainly",
    "Creating your account and verifying your identity",
    "Listing a property — the ten-step wizard",
    "Getting your listing verified and published",
    "Managing enquiries and leads",
    "Reviewing applications and choosing a tenant",
    "The legal consultation and the agreement",
    "Receiving the deposit and rent",
    "The Day 1 condition report — your side of it",
    "During the tenancy: maintenance and rent",
    "Renewal, the annual commission, and move-out",
    "Marketing packages, if you want reach",
    "Common questions",
])

# ---------------------------------------------------------------- the deal
g.h2("1. The commercial deal, stated plainly")

g.p("Before anything else, here is exactly what Odibrick costs you, because it is "
    "unusual enough to be worth stating up front.")

g.table(
    ["What", "Cost"],
    [["Listing a property", "<strong>Free.</strong> No listing fee, no cap on how "
      "many, no time limit, no paywall on publishing."],
     ["Verification of your listing", "Free."],
     ["Legal drafting and the video consultation",
      "Included in the plan you choose for the tenancy."],
     ["Annual commission",
      "Charged <strong>only when a tenancy actually starts.</strong> On the standard "
      "plan it is 50% of one month's rent for the year; on Protected it is 85%; on "
      "Managed it is 6% of annual rent. Plus GST."],
     ["Cambliss marketing packages",
      "Optional and separate. From ₹7,999 for 30 days. You never need to buy one to "
      "have your property listed or seen."]])

g.note("Nothing in the property module checks for a subscription. Free unlimited "
       "listing is enforced in code, not just promised in marketing copy. If you "
       "list twelve properties and none of them rents, Odibrick has earned nothing "
       "from you — which is the intended alignment.", kind="tip")

g.h3("What you get for the commission")
g.ul([
    "A tenant whose identity has been verified by a person, not a checkbox.",
    "An agreement drafted from a reviewed clause library and approved by a "
    "qualified legal professional before anyone signs.",
    "A video consultation where both parties agree the terms on the record.",
    "A payment ledger where every rupee has a reference and a receipt.",
    "A timestamped condition record of your property, acknowledged by the tenant.",
    "A dispute process backed by that record if things go wrong.",
])

# ------------------------------------------------------------------ signup
g.pagebreak()
g.h2("2. Your account and identity")

g.step(1, "Register as an owner",
       "<p>At <code>/register</code>, choose <strong>List my property</strong>. "
       "Use an email you check — applications and payment notifications arrive "
       "there.</p>")

g.step(2, "Verify your identity before anything else",
       "<p>You cannot publish a listing until your identity is verified. Go to "
       "<strong>Account → Identity</strong>, submit your document, and wait one to "
       "two working days for a person to review it.</p>")

s = Screen()
s.appbar("R. Reddy")


def body(b):
    b.gap(10)
    b.h1("Identity verification", 15)
    b.callout("You need a verified identity before publishing a property.")
    b.field("Full name, exactly as printed on the document", "Ramesh Reddy")
    b.field_row([("Document", "PAN", 140), ("Document number", "•••••1729", 200)])
    b.gap(8)
    b.field("Scan or photograph of the document", "pan-card.pdf")
    b.button("Submit for verification", w=190)


s.sidebar_page(NAV_OWNER, "Identity", body)
g.mock(s, "Identity verification — required before you can publish")

g.note("If you try to add a property before verifying, Odibrick redirects you here "
       "and explains why, rather than letting you complete ten steps and then "
       "refusing at the end.")

# ------------------------------------------------------------------ listing
g.pagebreak()
g.h2("3. Listing a property")

g.p("From <strong>Listing → My properties</strong>, choose <strong>Add a "
    "property</strong>. The wizard has ten steps and saves a draft at every one, so "
    "you can stop and come back. Nothing is visible to renters until you submit it "
    "and our team verifies it.")

s = Screen()
s.appbar("R. Reddy")
s.gap(8)
s.eyebrow("Step 3 of 10")
s.h1("Location", 15)
s.field("Address line 1", "Flat 402, Sunrise Residency",
        hint="Shown only to you, our verification team and a tenant you accept.")
s.field_row([("Locality", "Gachibowli", 200), ("City", "Hyderabad", 200)])
s.gap(8)
s.field_row([("State", "Telangana", 200), ("PIN code", "500032", 200)])
s.gap(10)
s.buttons([("Back", "secondary"), ("Save and continue", "primary"),
           ("Save draft", "ghost")])
g.mock(s, "The listing wizard — step 3 of 10")

g.h3("The ten steps")
g.table(
    ["Step", "What it asks", "Worth knowing"],
    [["1. Purpose", "Rent, sale or PG",
      "Renting runs the full process: verification, legal, agreement, payments, "
      "condition reports."],
     ["2. Property type", "Apartment, house, villa, studio…", "Affects how it is filtered."],
     ["3. Location", "Address, locality, city, PIN",
      "The exact address stays private. Search shows locality only."],
     ["4. Configuration", "Bedrooms, bathrooms, furnishing, parking", ""],
     ["5. Area & floor", "Carpet and built-up area, floor, age, facing",
      "Carpet area is what renters actually compare."],
     ["6. Pricing", "Rent, deposit, maintenance, lock-in, notice",
      "These are a starting position, not binding terms."],
     ["7. Amenities", "Lift, power backup, security, gym…", ""],
     ["8. Availability", "Available from, preferred tenants, pets", "See the warning below."],
     ["9. Description", "Title and description",
      "At least 80 characters. Vague listings get far fewer serious enquiries."],
     ["10. Photographs", "At least four to publish",
      "Checked against your ownership documents during verification."]])

g.note("On step 8 you can state a tenant preference. Refusing tenants on grounds "
       "such as religion or caste is unlawful in India, and listings that do so are "
       "removed. The wizard says this on the screen, and it is not decorative.",
       kind="warn")

g.h3("Pricing: the three numbers renters actually compare")
g.p("Rent, deposit and maintenance are shown separately on your listing and totalled "
    "into a move-in cost. A renter deciding between two flats sees that total, so an "
    "aggressive deposit will cost you enquiries even if your rent is competitive.")

s = Screen()
s.gap(10)
s.eyebrow("Step 6 of 10")
s.h1("Pricing", 15)
s.field_row([("Monthly rent", "28,000", 200), ("Security deposit", "1,12,000", 200)])
s.gap(8)
s.field_row([("Maintenance", "3,000", 200), ("Maintenance billed", "Monthly", 200)])
s.gap(8)
s.field_row([("Lock-in (months)", "6", 200), ("Notice period (days)", "60", 200)])
s.gap(10)
s.callout("Lock-in and notice go into the agreement, and the legal team will walk "
          "both parties through them before anyone signs.")
g.mock(s, "The pricing step")

g.h3("Photographs")
g.p("Four minimum. Practically, listings with eight to twelve good photographs get "
    "materially more enquiries than ones with four. Photograph every room, the "
    "kitchen and bathrooms properly, the balcony view, the building entrance, and "
    "the parking. Shoot in daylight.")

g.note("Photographs go to your private document vault and are attached to the "
       "listing. During verification our team checks them against the ownership "
       "documents you supplied — which is part of why a badge on this platform "
       "means something.")

# ------------------------------------------------------------ verification
g.pagebreak()
g.h2("4. Verification and publishing")

g.step(1, "Submit for verification",
       "<p>On the last step. The system re-checks completeness on the server, so if "
       "something required is missing you will be told exactly what.</p>")

g.step(2, "Our team reviews it",
       "<p>Usually within two working days. They check the ownership documents, your "
       "identity, the address and the photographs.</p>")

g.step(3, "It publishes, with seals",
       "<p>Each check that passes becomes a seal on your listing. Four seals is a "
       "fully verified property, and renters can filter for exactly that.</p>")

s = Screen()
s.gap(10)
s.h2("What has been verified")
s.badges([("KYC verified", "seal"), ("Owner verified", "seal"),
          ("Documents verified", "seal"), ("Address verified", "seal")])
s.gap(4)
s.para("Checks not listed above have not been completed.")
g.mock(s, "Verification seals as a renter sees them")

g.h3("If it is rejected")
g.p("You get a reason — the system requires one. Common causes are illegible "
    "ownership documents, photographs that do not match the stated property, or an "
    "address that cannot be confirmed. Fix it and resubmit; there is no penalty.")

s = Screen()
s.appbar("R. Reddy")


def body2(b):
    b.gap(10)
    b.h1("My properties", 15)
    b.para("Listing is free and unlimited. You are charged only when a tenancy starts.")
    b.gap(6)
    b.badges([("All", "seal"), ("Live", "neutral"), ("In review", "neutral"),
              ("Drafts", "neutral"), ("Rented", "neutral")])
    b.card("2 BHK apartment in Gachibowli",
           ["Gachibowli, Hyderabad · Apartment · ₹28,000/month",
            "412 views    18 enquiries    3 applications    Updated 2 days ago"],
           note="ACTIVE · 4 CHECKS VERIFIED · COMPLETENESS 92%")
    b.card("3 BHK villa in Kokapet",
           ["Kokapet, Hyderabad · Villa · ₹52,000/month",
            "0 views    0 enquiries    0 applications"],
           tone="ochre",
           note="DRAFT — NOT VISIBLE TO RENTERS")


s.sidebar_page(NAV_OWNER, "My properties", body2)
g.mock(s, "Your property inventory")

# ------------------------------------------------------------------- leads
g.pagebreak()
g.h2("5. Enquiries and leads")

g.p("Enquiries arrive under <strong>Listing → Leads</strong>. Each one is "
    "timestamped and tied to a property, so you can see which listing is actually "
    "generating interest and which is not.")

g.h3("Respond quickly")
g.p("Response time is the single biggest lever you control. A renter who sends four "
    "enquiries on a Saturday morning will usually have committed to something by "
    "Monday. Your response rate is visible to our team and factors into how listings "
    "are surfaced.")

g.h3("Scheduling viewings")
g.p("Arrange viewings through the platform rather than over the phone. A viewing in "
    "the system has a date, a time and a record — which matters if a renter later "
    "claims they were never shown the property, or if you need to demonstrate that "
    "you gave reasonable access.")

# ------------------------------------------------------------ applications
g.h2("6. Reviewing applications and choosing a tenant")

s = Screen()
s.gap(10)
s.badges([("Submitted", "ochre"), ("Identity verified", "seal")])
s.h1("Priya Sharma", 15)
s.para("For 2 BHK apartment in Gachibowli, Gachibowli")
s.gap(4)
s.para("2 occupants · Couple · Move in 01 Jul 2026 · 11 months · Offer ₹28,000")
s.gap(4)
s.card("Message",
       ["Working couple, no pets, looking for a long stay."], h=42)
s.buttons([("Accept", "primary"), ("Shortlist", "secondary"), ("Decline", "ghost")])
g.mock(s, "An application, as you see it")

g.h3("What to look at")
g.table(
    ["Signal", "What it tells you"],
    [["Identity verified",
      "A person on our team checked their government ID against their name. An "
      "unverified applicant cannot apply at all, so every application you see has "
      "cleared this."],
     ["Occupants and household type",
      "Compare against what the property can actually take. An occupancy figure "
      "that turns out wrong on move-in day is a breach of the agreement you are "
      "about to sign."],
     ["Move-in date", "Becomes the tenancy start date in the agreement."],
     ["Tenure", "Eleven or twelve months is standard. Longer is usually better for you."],
     ["Their message", "Two sentences of context tells you more than the form fields do."]])

g.note("<strong>Accepting is consequential.</strong> The moment you accept, three "
       "things happen in one transaction: a tenancy is created, a legal case is "
       "opened, and your listing is paused so nobody else applies. The confirmation "
       "screen spells this out rather than hiding it behind a one-click button. "
       "Other applicants are <em>not</em> automatically rejected — decline them "
       "yourself if you have decided.", kind="warn")

g.h3("Declining well")
g.p("A reason is required and it is shared with the applicant. "
    "<em>Already committed to another applicant</em> is a complete and honest "
    "answer. It costs you nothing and it saves someone a week of waiting.")

# ------------------------------------------------------------------- legal
g.pagebreak()
g.h2("7. The consultation and the agreement")

g.p("Once you accept, Odibrick's legal team takes over the drafting. You will be "
    "invited to a video consultation with the tenant.")

g.h3("On the call")
g.ul([
    "A member of the legal team walks both parties through the terms.",
    "You agree the specifics: deposit refund window, who pays for which repairs, "
    "lock-in, notice, any rent escalation on renewal.",
    "The outcome is recorded as a note on the case.",
    "The draft is then written to match what was agreed.",
])

g.h3("Reviewing and signing")

s = Screen()
s.gap(10)
s.eyebrow("ODB-AGR-2026-000001")
s.h1("Leave and Licence Agreement", 15)
s.badges([("Awaiting signatures", "ochre")])
s.callout("Draft. This document is not in force until every party has signed and "
          "it is executed.")
s.datarows([("Rent", "₹28,000 / month"), ("Deposit", "₹1,12,000"),
            ("Maintenance", "₹3,000 / month"), ("Lock-in", "6 months"),
            ("Notice", "60 days"), ("Approved by", "Adv. Shalini Menon")],
           title="Key terms")
s.buttons([("Read full agreement", "secondary"), ("Sign", "primary")])
g.mock(s, "An agreement ready for your signature")

g.step(1, "Check every number",
       "<p>Rent, deposit, maintenance, dates, lock-in, notice. If any of it differs "
       "from what was agreed on the call, raise it before signing.</p>")

g.step(2, "Note who approved it",
       "<p>The page names the legal professional who approved this exact version. "
       "If the draft is changed afterwards, that approval is cancelled "
       "automatically and it must be reviewed again — an edit cannot slip past "
       "approval to a signature.</p>")

g.step(3, "Sign",
       "<p>Your signature is recorded with a timestamp and IP address. The "
       "agreement becomes <strong>Executed</strong> only when both parties have "
       "signed.</p>")

g.note("An executed agreement here is a signed document, not a registered one. "
       "Stamp duty and registration are state-specific and remain your "
       "responsibility. The platform tracks the stamping status but does not pay "
       "duty for you.", kind="warn")

# ----------------------------------------------------------------- payments
g.pagebreak()
g.h2("8. Receiving the deposit and rent")

g.p("The moment the agreement is executed, Odibrick raises the move-in dues on the "
    "ledger — deposit and first month — each with a reference number.")

s = Screen()
s.appbar("R. Reddy")


def body3(b):
    b.gap(10)
    b.h1("Payments", 15)
    b.gap(4)
    b.table(["Reference", "Purpose", "Date", "Amount", "Status"],
            [["ODB-PAY-2026-000412", "Security deposit", "13 Jun", "+₹1,12,000", "Paid"],
             ["ODB-PAY-2026-000413", "Advance rent", "13 Jun", "+₹28,000", "Paid"],
             ["ODB-PAY-2026-000521", "Monthly rent", "05 Jul", "+₹28,000", "Due"]],
            widths=[190, 130, 80, 110, 80])
    b.callout("Odibrick does not hold your money. Payments settle directly to you "
              "or through a licensed provider.")


s.sidebar_page(NAV_OWNER, "Payments", body3)
g.mock(s, "Your side of the ledger — incoming payments")

g.h3("How money actually moves")
g.p("Odibrick is non-custodial by default. The tenant transfers to you directly, "
    "quoting the reference code, and an Odibrick operator matches the credit against "
    "the bank statement before marking it paid. If a licensed payment gateway is "
    "enabled on your deployment, collection runs through that instead.")

g.note("A payment is never marked paid because someone says it was. It needs either "
       "a verified provider callback or an operator who has matched a real bank "
       "reference. That protects you as much as it protects the tenant.")

g.h3("What happens next")
g.p("When both move-in payments clear, the tenancy moves automatically to "
    "<strong>Check-in pending</strong> and the tenant is asked to file the Day 1 "
    "condition report.")

# -------------------------------------------------------- condition report
g.h2("9. The Day 1 condition report")

g.p("The tenant photographs the property room by room on the day they take "
    "possession. You then review and acknowledge it. This is worth your careful "
    "attention, because it is the document a deposit deduction gets checked against "
    "at the end of the tenancy.")

s = Screen()
s.gap(10)
s.card("This report is waiting for your response",
       ["Read through it carefully. Once both parties acknowledge, it becomes the",
        "agreed record of the property's condition. If something is wrong or",
        "missing, say so now rather than later."],
       tone="ochre", h=62)
s.buttons([("I agree with this record", "primary"), ("Something is wrong", "secondary")])
g.mock(s, "Acknowledging the tenant's condition report")

g.step(1, "Read every item, not just the flagged ones",
       "<p>The report covers seven rooms and the elements in each. Look at what has "
       "been marked <em>Good</em> as well as what has been marked "
       "<em>Damaged</em>.</p>")

g.step(2, "Check the photographs",
       "<p>Each attachment shows two timestamps: the time the tenant's device "
       "reported, and the time the file reached our servers. Only the second is "
       "trustworthy, and both are displayed.</p>")

g.step(3, "Disagree now, not later",
       "<p>If the tenant has recorded damage that was not there, or missed damage "
       "that was, say so at this point. Choosing <strong>Something is wrong</strong> "
       "flags a disagreement on the record instead of silently overwriting it.</p>")

g.step(4, "Acknowledge",
       "<p>When both parties have acknowledged, the report is sealed and the tenancy "
       "becomes <strong>Active</strong>.</p>")

g.note("If you skip this step, you are relying on the tenant's unopposed account of "
       "your property's condition. Ten minutes now is worth considerably more than "
       "an argument in eleven months.", kind="tip")

# --------------------------------------------------------------- occupancy
g.pagebreak()
g.h2("10. During the tenancy")

g.h3("Maintenance requests")
g.p("Requests arrive with a ticket number, a category, a priority and usually a "
    "photograph. You approve, reject or schedule them, and you record who bears the "
    "cost.")

s = Screen()
s.gap(10)
s.badges([("Owner review", "ochre"), ("Normal", "neutral")])
s.h1("Kitchen sink drains slowly", 15)
s.para("ODB-MNT-2026-000118 · Plumbing · raised by Priya Sharma · 2 days ago")
s.gap(4)
s.field_row([("Status", "Approved", 180), ("Cost bearer", "Owner", 180)])
s.gap(8)
s.field_row([("Estimated cost", "1,500", 180), ("Scheduled for", "12 Aug 2026", 180)])
s.gap(10)
s.field("Note to the tenant", "Plumber will call before visiting.")
s.button("Save update", w=150)
g.mock(s, "Responding to a maintenance request")

g.table(
    ["Cost bearer", "When it applies"],
    [["Owner", "Structural issues, appliance failure, anything from normal ageing."],
     ["Tenant", "Damage the tenant caused, consumables, blockages from misuse."],
     ["Shared", "Where responsibility is genuinely mixed and you have agreed a split."],
     ["Undecided", "Use while you work it out. It is honest and it is recorded."]])

g.note("Emergency-priority requests mean something is actively causing damage. "
       "Treat them as such — a delayed response to a real emergency is the kind of "
       "thing that ends up in a dispute with a timestamp attached to it.")

g.h3("Rent")
g.p("Monthly rent is raised on the ledger with a due date. If a tenant falls behind, "
    "the record shows exactly what was due and when — which is far more useful than "
    "a recollection if it ever escalates.")

# ---------------------------------------------------------------- renewal
g.h2("11. Renewal, commission and move-out")

g.h3("The annual commission")
g.p("The commission is generated when the tenancy starts, for the first year, and "
    "again for each renewal year. It appears on your ledger as an invoice with its "
    "own reference.")

g.table(
    ["Plan", "Commission", "Basis"],
    [["Standard", "50% of one month's rent", "Per tenancy year, plus GST"],
     ["Protected", "85% of one month's rent",
      "Includes condition reports, legal support and eligible partner insurance"],
     ["Managed", "6% of annual rent", "Full management"]])

g.note("Changing a commission rule does not retroactively reprice existing "
       "tenancies. Whatever rule applied when your tenancy started is the rule that "
       "governs it.")

g.h3("Move-out")
g.p("The tenant files a move-out condition report. Odibrick compares it against the "
    "Day 1 record automatically, element by element, and shows what changed.")

s = Screen()
s.gap(10)
s.card("Compared with the Day 1 record",
       ["2 items changed, 34 unchanged", "",
        "Kitchen · Appliances        Fair  →  Damaged",
        "Bathroom · Fixtures         Fair  →  Damaged"], h=76)
s.callout("This comparison is a record, not a determination of liability.")
g.mock(s, "The automatic move-out comparison")

g.note("Read that line carefully, because it constrains you as well as protecting "
       "you. Odibrick produces the diff; it does not rule on who owes what, and it "
       "will not deduct from a deposit on your say-so. Fair wear and tear over a "
       "year is not damage. A deduction needs either the tenant's agreement or a "
       "dispute resolution.", kind="warn")

# --------------------------------------------------------------- marketing
g.pagebreak()
g.h2("12. Marketing packages")

g.p("Entirely optional. Your listing is free, unlimited and visible without ever "
    "buying one. What a package buys is <em>reach</em> — Cambliss runs a campaign "
    "with creative, paid media and landing pages, and reports the performance back "
    "into your dashboard.")

g.table(
    ["Package", "Price", "For"],
    [["Starter", "₹7,999 / 30 days", "One property that is not moving."],
     ["Growth", "₹24,999 / 30 days", "A small portfolio, or a competitive locality."],
     ["Premium", "₹59,999 / 30 days", "Sustained visibility across a city."],
     ["Builder Enterprise", "Custom quote", "Project launches."]])

g.note("Featured placement exists only while a paid campaign is actually live. When "
       "a campaign is paused or completed, the flag is cleared automatically. You do "
       "not keep a promoted slot you are no longer paying for, and nobody else does "
       "either.")

# --------------------------------------------------------------------- faq
g.h2("13. Common questions")

g.faq([
    ("Is listing really free, with no catch?",
     "Yes. There is no listing fee, no cap and no time limit, and nothing in the "
     "code checks for a subscription before letting you publish. Odibrick earns when "
     "a tenancy starts, not when you upload."),
    ("Can I list a property I manage but do not own?",
     "Register as an agent instead. The verification process checks ownership "
     "documents, and an agent account is the correct structure for managing "
     "someone else's inventory."),
    ("Who sees my exact address?",
     "You, our verification team, and a tenant whose application you have accepted. "
     "Search results and public property pages show locality and city only."),
    ("Can I refuse a tenant for any reason?",
     "You choose your tenant. But refusing on grounds such as religion or caste is "
     "unlawful in India, and listings or conduct that do so are removed from the "
     "platform."),
    ("What if I want to sell the property mid-tenancy?",
     "That depends on your agreement and on state law. Raise it with the legal team "
     "through a support ticket before you commit to anything."),
    ("Does Odibrick guarantee my rent?",
     "No. Odibrick records payments and provides a dispute process. It is not a "
     "guarantor, an insurer or a debt collector. Protection products, where offered, "
     "are issued by licensed insurers and are separate from the platform."),
    ("Can I deduct from the deposit myself?",
     "No. Odibrick will not move a deduction through on your say-so. You need the "
     "tenant's agreement, or a resolution through the dispute process."),
    ("What happens to my listing when I accept an application?",
     "It is paused immediately, so no further applications arrive. If the tenancy "
     "falls through before the agreement is executed, support can reactivate it."),
    ("How many photographs should I upload?",
     "Four is the minimum. Eight to twelve gets materially more enquiries. It is the "
     "cheapest improvement available to you."),
])

g.h2("Where to get help")
g.p("<strong>Account → Support</strong> raises a ticket, which creates a record and "
    "is faster than any other route. Quote the reference of whatever you are asking "
    "about — a property, a payment reference, an agreement number.")

g.build("/home/claude/guides/out/Odibrick-Owner-Guide.pdf")
print("owner guide built")
