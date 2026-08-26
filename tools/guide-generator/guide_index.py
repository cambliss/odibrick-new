from builder import Guide

g = Guide(
    role="Index",
    title="Odibrick\nuser guides",
    lede="Six guides, one per role. Start with the one that matches your account.",
    audience="Everyone",
)

g.h2("Which guide do you need?")
g.table(
    ["If you are…", "Read", "Pages"],
    [["Looking to rent a home",
      "<strong>Tenant guide</strong> — search, apply, sign, pay, and the Day 1 "
      "condition report that protects your deposit", "15"],
     ["Letting out a property you own",
      "<strong>Property owner guide</strong> — free listing, choosing a tenant, "
      "the agreement, and the annual commission", "13"],
     ["An agent or a developer",
      "<strong>Agent &amp; builder guide</strong> — unlimited inventory, leads, "
      "projects and Cambliss campaigns", "8"],
     ["On the legal team",
      "<strong>Legal team guide</strong> — the case queue, clause library, "
      "drafting, approval and consultations", "8"],
     ["Reviewing identities or listings",
      "<strong>Verification team guide</strong> — what a badge means and how to "
      "apply it consistently", "8"],
     ["Admin, marketing, support, property manager or insurance partner",
      "<strong>Administration guide</strong> — control centre, users, payments, "
      "campaigns, tickets and policies", "9"]])

g.h2("About the illustrations")
g.note("Every interface illustration in these guides is a <strong>rendered "
       "mockup</strong>, not a screenshot. The Odibrick codebase has not yet been "
       "compiled or deployed, so no running instance exists to photograph. The "
       "mockups are drawn from the actual source — the colours, typefaces, "
       "component shapes and screen structures come from "
       "<code>apps/web/tailwind.config.ts</code> and the real page components — so "
       "they are an accurate guide to what you will see, but they are drawings.<br/><br/>"
       "Once the platform is running, replace them with real screen captures.",
       kind="warn", label="Please read")

g.h2("What every guide assumes")
g.ul([
    "Odibrick is not a listings board. It stays involved through verification, "
    "legal review, the agreement, payment and the condition record.",
    "A verification seal exists only where a person has actually checked that item. "
    "A missing seal means the check was not done, not that something is wrong.",
    "Odibrick does not hold your money, does not issue insurance, and does not "
    "decide disputes. It records what happened, accurately, at the time it "
    "happened.",
    "Listing is free and unlimited for owners, agents and builders. The platform "
    "earns from completed tenancies and from optional marketing packages.",
])

g.h2("Getting help")
g.p("From any signed-in account: <strong>Account → Support</strong>. Quote the "
    "reference code of whatever you are asking about, and if you saw an error "
    "message, include the trace ID printed at the bottom of it.")

g.build("/home/claude/guides/out/Odibrick-Guides-Index.pdf")
print("index built")
