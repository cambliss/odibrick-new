from builder import Guide
from mockup import Screen, NAV_OWNER

g = Guide(
    role="Agent & Builder",
    title="Inventory, leads\nand campaigns",
    lede=("Unlimited free listings, a verified business profile, and paid reach only "
          "when you actually want it."),
    audience="Property agents, agencies and residential developers",
)

g.h2("What is in this guide")
g.toc([
    "The deal for agents and builders",
    "Setting up a verified business profile",
    "Adding inventory at scale",
    "Builders: projects and units",
    "Working your leads",
    "Applications and closing a tenancy",
    "Cambliss marketing packages",
    "Reading campaign performance",
    "Commission and invoicing",
    "Common questions",
])

# ------------------------------------------------------------------- deal
g.h2("1. The deal for agents and builders")

g.p("Most portals charge you per listing, per lead, or per month for the privilege "
    "of appearing at all. Odibrick does not. The inventory side is free and "
    "uncapped, and the platform earns from completed tenancies and from marketing "
    "you choose to buy.")

g.table(
    ["What you get free", "Always"],
    [["Unlimited property and unit inventory", "No cap, no per-listing fee"],
     ["A verified business profile with your RERA number", "Free"],
     ["Leads, enquiries and site-visit tracking", "Free"],
     ["Views and conversion analytics per listing", "Free"],
     ["Transaction support through to the agreement", "Free"],
     ["Verification of your listings", "Free"]])

g.table(
    ["What costs money", "When"],
    [["Annual commission",
      "Only when a tenancy actually starts. Charged per tenancy year."],
     ["Cambliss marketing packages",
      "Only if you buy one. From ₹7,999 for 30 days."]])

g.note("Featured placement is tied to a live paid campaign and nothing else. There "
       "is no way to buy a permanent boost, and when your campaign ends the flag "
       "clears automatically. Everyone's listings compete on the same terms the rest "
       "of the time.", kind="tip")

# ---------------------------------------------------------------- profile
g.pagebreak()
g.h2("2. Setting up a verified business profile")

g.step(1, "Register with the right account type",
       "<p>At <code>/register</code>, choose <strong>I am an agent</strong> or "
       "<strong>I am a builder</strong>. The two accounts behave differently: "
       "builders get projects and unit inventory, agents get a straight property "
       "list.</p>")

g.step(2, "Verify your own identity",
       "<p><strong>Account → Identity</strong>. Required before you can publish "
       "anything. One to two working days.</p>")

g.step(3, "Complete the business details",
       "<p>Under <strong>Account → Profile</strong>. Agency or company name, RERA "
       "registration number, GSTIN, and for builders the CIN and website.</p>")

s = Screen()
s.appbar("Skyline Realty")


def body(b):
    b.gap(10)
    b.h1("Business profile", 15)
    b.field_row([("Agency name", "Skyline Realty", 240),
                 ("RERA number", "TS/RERA/AG/1004", 200)])
    b.gap(8)
    b.field_row([("GSTIN", "36AABCS1429P1ZR", 240), ("Team size", "12", 120)])
    b.gap(10)
    b.button("Save profile", w=150)
    b.gap(4)
    b.card("How your profile appears publicly",
           ["Skyline Realty · Agent · RERA TS/RERA/AG/1004",
            "Member since June 2026 · 34 active listings · Identity verified",
            "",
            "Contact details are never shown publicly. Enquiries route through",
            "Odibrick so there is a record of who asked for what, and when."],
           h=92)


s.sidebar_page(NAV_OWNER, "Identity", body)
g.mock(s, "Your business profile, and how it appears to renters")

g.note("Your phone number and email never appear on a public profile. This is "
       "deliberate: it stops your contact list being scraped, and it means every "
       "enquiry arrives with a timestamp and an audit trail rather than as an "
       "untraceable call.")

# -------------------------------------------------------------- inventory
g.h2("3. Adding inventory at scale")

g.p("Each property goes through the same ten-step wizard as an owner listing. Two "
    "features exist specifically to make volume manageable.")

g.h3("Duplicate a listing")
g.p("From any property in your inventory, <strong>Duplicate</strong> creates a new "
    "draft with everything copied except the unit-specific details. For a tower "
    "where you are letting six near-identical 2 BHKs, this turns an hour into ten "
    "minutes.")

g.h3("Draft, then publish in a batch")
g.p("Every step of the wizard saves. Build your drafts across the week, then submit "
    "them for verification together when the photographs are ready.")

s = Screen()
s.appbar("Skyline Realty")


def body2(b):
    b.gap(10)
    b.h1("My properties", 15)
    b.para("34 listings · 28 live · 4 in review · 2 drafts")
    b.gap(6)
    b.badges([("All", "seal"), ("Live", "neutral"), ("In review", "neutral"),
              ("Drafts", "neutral"), ("Rented", "neutral")])
    b.card("2 BHK apartment in Kondapur",
           ["Kondapur, Hyderabad · ₹26,000/month",
            "289 views   12 enquiries   2 applications"],
           note="ACTIVE · 4 CHECKS VERIFIED · COMPLETENESS 88%")
    b.card("3 BHK apartment in Kondapur",
           ["Kondapur, Hyderabad · ₹34,000/month",
            "512 views   31 enquiries   5 applications"],
           note="ACTIVE · PROMOTED · COMPLETENESS 96%")


s.sidebar_page(NAV_OWNER, "My properties", body2)
g.mock(s, "Agent inventory with per-listing performance")

g.h3("The completeness score")
g.p("Every listing carries a completeness percentage. It is not decoration — it "
    "reflects how much of the listing is filled in, and incomplete listings get "
    "meaningfully fewer enquiries. Anything below 80% is worth ten minutes.")

# --------------------------------------------------------------- builders
g.pagebreak()
g.h2("4. Builders: projects and units")

g.p("A builder account adds a layer above properties: the project. A project holds "
    "its own name, location, status, total unit count and possession date, and "
    "individual units hang off it.")

s = Screen()
s.gap(10)
s.eyebrow("Project")
s.h1("Meridian Heights", 15)
s.badges([("Under construction", "ochre"), ("RERA verified", "seal")])
s.gap(4)
s.datarows([("Location", "Gachibowli, Hyderabad"),
            ("Total units", "248"),
            ("Possession", "March 2027"),
            ("RERA number", "TS/RERA/PRJ/2000"),
            ("Units listed", "36")], title="Project details")
s.button("Add units", w=140)
g.mock(s, "A builder project")

g.h3("Practical notes")
g.ul([
    "Register the project first, then add units to it. Units created without a "
    "project are harder to present coherently to a buyer.",
    "Your RERA number appears on the public project page. It is one of the strongest "
    "trust signals available to you — fill it in.",
    "Possession dates are visible to buyers. An optimistic date that slips is worse "
    "for you than a realistic one.",
    "Unit inventory is free and uncapped, exactly like agent inventory.",
])

# ------------------------------------------------------------------ leads
g.h2("5. Working your leads")

g.p("Enquiries land under <strong>Listing → Leads</strong>, each tied to a property "
    "and timestamped.")

g.table(
    ["Status", "What it means", "What to do"],
    [["New", "Nobody has responded.", "Respond. Speed is the whole game here."],
     ["Contacted", "You have replied.", "Move it toward a viewing."],
     ["Visit scheduled", "A viewing is booked.", "Confirm the day before."],
     ["Closed", "Dead, or converted.", "Record which, so your numbers mean something."]])

g.note("Schedule viewings through the platform rather than over the phone. A viewing "
       "in the system has a date, a time and a record — useful for your own "
       "follow-up discipline, and useful if a client later disputes what was shown.")

g.h3("What your analytics actually tell you")
g.p("Each listing shows views, enquiries and applications. The ratios matter more "
    "than the absolute numbers:")

g.table(
    ["Pattern", "Likely cause", "Fix"],
    [["Low views", "Poor placement or a narrow locality.",
      "Check the completeness score. Consider a campaign."],
     ["Views but no enquiries", "The listing looks wrong on the page.",
      "Usually photographs or a thin description. Both are free to fix."],
     ["Enquiries but no applications", "Something surfaces on contact.",
      "Often the deposit, or terms that were not clear on the listing."],
     ["Applications but no tenancies", "Falling over at acceptance or legal.",
      "Look at your response time on applications."]])

# ------------------------------------------------------------ applications
g.pagebreak()
g.h2("6. Applications and closing a tenancy")

g.p("Applications you receive work exactly as they do for an owner. Every applicant "
    "has already had their identity verified by a person — unverified users cannot "
    "apply at all.")

g.note("<strong>Accepting is consequential.</strong> It creates the tenancy, opens a "
       "legal case and pauses the listing in a single transaction. Other applicants "
       "are not auto-rejected — decline them yourself once you have decided, with a "
       "reason. It takes seconds and it is the difference between a professional "
       "operation and a black hole.", kind="warn")

g.p("After acceptance, Odibrick's legal team drafts the agreement and runs a video "
    "consultation with the parties. You are not responsible for drafting, and you "
    "should not be supplying your own template — the platform's clause library is "
    "reviewed and versioned, and the agreement is approved by a qualified "
    "professional before signature.")

# --------------------------------------------------------------- marketing
g.h2("7. Cambliss marketing packages")

g.p("This is the paid product, and it is genuinely optional. What you are buying is "
    "a campaign run by the Cambliss team: creative, paid media, landing pages and "
    "qualified leads, with performance reported into your dashboard.")

s = Screen()
s.gap(10)
s.h1("Marketing packages", 15)
s.card("Starter — ₹7,999 / 30 days",
       ["1 featured slot · basic creative · platform placement"], h=42)
s.card("Growth — ₹24,999 / 30 days",
       ["3 featured slots · creative production · paid social · lead capture"], h=42)
s.card("Premium — ₹59,999 / 30 days",
       ["8 featured slots · full creative · multi-channel media · landing pages"], h=42)
s.card("Builder Enterprise — custom quote",
       ["Project launch campaigns, scoped to the development"], h=42)
g.mock(s, "The package catalogue")

g.h3("How ordering works")

g.step(1, "Choose a package and link your properties",
       "<p>Under <strong>Listing → Marketing</strong>. Select the properties you "
       "want promoted and write a brief describing what you are trying to "
       "achieve.</p>")

g.step(2, "Pay the invoice",
       "<p>An invoice is raised on your ledger with a reference. The campaign cannot "
       "go live until it is settled — the system blocks that transition rather than "
       "extending informal credit.</p>")

g.step(3, "Cambliss produces and launches",
       "<p>The campaign moves through Requested → Approved → In production → "
       "Scheduled → Live. You can see the stage at any point.</p>")

g.step(4, "Featured placement switches on",
       "<p>When the campaign goes live, your linked properties are flagged as "
       "promoted. When it is paused or completed, the flag clears automatically.</p>")

g.note("Enterprise packages are a custom quote rather than a fixed price. Ordering "
       "one raises a request, and the Cambliss team comes back with a scoped "
       "proposal before anything is charged.")

# ------------------------------------------------------------- performance
g.pagebreak()
g.h2("8. Reading campaign performance")

s = Screen()
s.gap(10)
s.eyebrow("Campaign · ODB-MKT-2026-000318")
s.h1("Tech corridor rentals", 15)
s.badges([("Live", "seal"), ("Growth package", "neutral")])
s.gap(4)
s.datarows([("Budget", "₹15,000"), ("Spent", "₹6,420"),
            ("Impressions", "62,180"), ("Clicks", "1,847"),
            ("Click-through rate", "2.97%"), ("Leads", "43"),
            ("Cost per lead", "₹149")], title="Performance to date")
s.para("Runs 05 Aug 2026 — 04 Sep 2026 · 6 properties linked")
g.mock(s, "Campaign performance")

g.h3("What to look at, and in what order")
g.table(
    ["Metric", "Read it as"],
    [["Cost per lead",
      "The only number that matters commercially. Compare it against what a "
      "tenancy is worth to you."],
     ["Click-through rate",
      "Whether the creative is landing. Below about 1% suggests the ad is not "
      "speaking to the audience."],
     ["Leads versus clicks",
      "Whether the landing experience converts. Lots of clicks and few leads points "
      "at the listing page, not the ad."],
     ["Views in period, per property",
      "Which specific properties the campaign actually moved."]])

g.note("Campaign figures come from the campaign record, which the Cambliss team "
       "updates from the ad platforms. Where a number has not been reported yet, "
       "the dashboard shows nothing rather than an estimate.")

# -------------------------------------------------------------- commission
g.h2("9. Commission and invoicing")

g.p("When a tenancy you brokered starts, a commission is generated for that tenancy "
    "year and invoiced. It appears on the ledger with its own reference, like every "
    "other payment.")

g.table(
    ["Plan", "Commission", "Payer"],
    [["Standard", "50% of one month's rent", "Owner, by default"],
     ["Protected", "85% of one month's rent", "Owner, by default"],
     ["Managed", "6% of annual rent", "Owner, by default"]])

g.p("Commission rules carry a date range and can be city-specific. Whichever rule "
    "was in force when a tenancy started governs that tenancy for its whole life — "
    "a later rule change does not reprice it.")

# --------------------------------------------------------------------- faq
g.h2("10. Common questions")

g.faq([
    ("Is there really no limit on listings?",
     "None. No cap, no fee, no expiry. Nothing in the property module checks for a "
     "subscription before letting you publish."),
    ("Can I bulk-upload inventory from a spreadsheet?",
     "Not in this version. Use Duplicate on a similar listing, which handles most of "
     "the repetition for a tower or a project."),
    ("Do I need a RERA number?",
     "Legally that depends on your state and what you are doing. On Odibrick it is "
     "optional but strongly recommended — it appears on your public profile and it "
     "is one of the few trust signals a renter can check independently."),
    ("Will buying a package guarantee me tenancies?",
     "No, and anyone who tells you otherwise is selling something. A package buys "
     "reach. Whether that reach converts depends on your pricing, your photographs "
     "and how fast you answer enquiries."),
    ("Can I keep featured placement after my campaign ends?",
     "No. The flag is cleared automatically when a campaign is paused or completed. "
     "This is enforced in code."),
    ("What happens if I list a property I do not have the right to let?",
     "Verification checks ownership documents, and duplicate-address detection flags "
     "the same property listed twice. Both go to a human reviewer. Listings that "
     "cannot be substantiated are rejected."),
    ("Can my whole team use one account?",
     "One account per person is better — every action is audited with the actor's "
     "identity, and a shared login destroys that. Team size is a profile field, not "
     "a licence count."),
    ("Who drafts the rental agreement?",
     "Odibrick's legal team, from a reviewed clause library, approved by a qualified "
     "professional before signature. You do not supply a template and you are not "
     "responsible for the drafting."),
])

g.h2("Where to get help")
g.p("<strong>Account → Support</strong> raises a ticket. For campaign questions, "
    "your Cambliss campaign manager is named on the campaign record.")

g.build("/home/claude/guides/out/Odibrick-Agent-Builder-Guide.pdf")
print("agent/builder guide built")
