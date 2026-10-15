# Rewards Program: Intake Questionnaire

**For:** Variety H2O + Ice Cream owners and staff
**From:** the app's engineering team
**Status:** draft, waiting on answers (prepared 2026-10-03)

## Why this exists

The app already tracks each customer's prepaid gallons and shows a "tier" badge. The next planned
feature is an in-app reward reminder (for example, "you're 3 gallons away from your next reward")
that appears when a customer opens the app.

Before building it, the rules need to come from the people who run the shop, not from guesses in
code. A reward the app promises but the counter doesn't honor is worse than no reward at all. This
questionnaire collects every decision the build depends on, so it can be done once and done right.

Each section gives a short reason so it's clear why the answer matters. "Not sure yet" and "let's
start simple" are both useful answers.

## What the app does today

- Each customer has a **prepaid gallon balance**. Staff add gallons when the customer pays and
  subtract them when the customer fills up. Every change is logged with a date and note.
- Customers see a **tier badge** based on their *current balance*:

  | Tier | Current balance |
  | --- | --- |
  | Splash | 0-199 gallons |
  | Frost | 200-499 gallons |
  | Glacier | 500-999 gallons |
  | Blizzard | 1,000+ gallons |

  These tiers are **cosmetic only**. They don't unlock anything, and a customer's tier drops as
  they use their gallons.
- The app does **not** track dollars spent, ice cream or other menu purchases, or visits. It only
  knows gallon credits and debits.
- There are **no text messages or push notifications**. Reminders show inside the app only.

---

## 1. Goal of the program

*Why we ask: the goal decides what to measure. Rewarding loyalty, rewarding big buyers and
bringing back lapsed customers each lead to different rules.*

1. What is the main thing you want the rewards program to encourage? (For example: buying larger
   prepaid packages, coming back more often, trying ice cream, or bringing back customers who
   stopped coming.)
2. Is this program for prepaid-water customers only, or for every customer, including people who
   only buy ice cream or snacks?
3. Is there a reward program running today, even an informal one (punch cards, "regulars get a
   free gallon", etc.)? If so, how does it work, and should the app replace it or match it?

## 2. What earns progress

*Why we ask: the app can only count what it records. Gallons are already tracked; anything else
needs new data entry at the counter.*

4. What should count toward a reward?
   - [ ] Gallons **purchased** (credited to the account)
   - [ ] Gallons **used** (filled at the store)
   - [ ] Dollars spent (on water only, or on everything?)
   - [ ] Number of visits
   - [ ] Something else: ________
5. An earlier idea was "every **$200 spent** earns a credit or a free item". Is that still the plan,
   changed, or dropped?
6. If dollars count: would staff be willing to enter the purchase amount in the app at checkout? It
   adds a step for every sale, because the app is not connected to the Square register.
7. Do refunds, corrections or staff-entered adjustments count, or only real purchases?

## 3. Reward levels

*Why we ask: these are the exact numbers the app shows to customers, so they must match what the
counter honors.*

8. At what point does a customer earn a reward? (For example: every 100 gallons purchased, or every
   $200 spent.)
9. What does the customer get? (For example: free gallons added to their balance, a free ice cream,
   a percentage off.)
10. Is there one reward that repeats (every X earns Y), or several levels with bigger rewards
    higher up?
11. Should the existing tiers (Splash, Frost, Glacier, Blizzard) become real reward levels with
    benefits, stay cosmetic, be renamed, or be removed?

## 4. Time limits and resets

*Why we ask: the app needs to know when progress counts and when it stops counting.*

12. Does progress ever reset? (For example: per calendar year, after a reward is earned, or never.)
13. Do earned rewards expire? If so, after how long?
14. What happens to progress already made if the rules change later?
15. Should purchases made **before** the program launches count toward the first reward?

## 5. Redeeming a reward

*Why we ask: this decides what staff do at the counter and what the app has to record.*

16. How does a customer use a reward? Do they show the app, does staff look them up, or is it
    applied automatically?
17. If the reward is free gallons, should the app add them to the balance automatically, or should
    staff confirm each one?
18. Can a customer save rewards and use several at once, or is it one at a time?
19. Who can approve a reward: any staff member, or only an owner or admin?

## 6. The reminder customers see

*Why we ask: this is the feature itself, so its wording and timing are your call.*

20. When is a customer "close" to a reward? (For example: within 10 gallons, or within 10% of the
    goal.)
21. Should the reminder appear every time the app opens, once a day, or only once per milestone?
22. Can a customer dismiss it or turn it off?
23. Is there wording or a tone you want, or wording to avoid? (A sample line is welcome.)
24. Should customers also see how much progress they've made in total, or only the reminder?

## 7. Fairness and edge cases

*Why we ask: these situations will happen at the counter, and the app needs a defined answer for
each.*

25. Families sharing one account, or one person with several accounts: how should progress be
    counted?
26. Customers who haven't claimed their app login yet: should they still earn progress (visible to
    staff) and see it once they sign in?
27. What if a customer disputes their progress? Should staff be able to adjust it, and should every
    adjustment be logged the way gallon changes are?
28. Are staff or family members eligible?

## 8. Launch and communication

29. Is there a target launch date, or an event it should line up with?
30. How will customers hear about it: a sign at the counter, the website, social media, or in the
    app?
31. Any legal or tax considerations you're aware of for free product or discounts?
32. Who should be the contact for questions while this is being built?

---

## What happens next

1. The answers are turned into a written rule sheet in plain language and sent back for sign-off.
2. Once signed off, the rules are built into the app, with automated tests that check every number
   in the rule sheet (thresholds, resets, expiry).
3. Before launch, staff try the reward flow on a preview version of the app and confirm it matches
   what happens at the counter.

Nothing about the rules gets decided in code without an answer here.
