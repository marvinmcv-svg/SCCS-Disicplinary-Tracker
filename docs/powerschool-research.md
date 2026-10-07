# What we learned from PowerSchool (and what we built)

PowerSchool is the most widely deployed K-12 student information system (SIS) in North America. Before adding features we looked at why schools choose it, what its users complain about, and which ideas fit a discipline-first tool for one school.

## Why schools choose PowerSchool

| Strength | What it means in practice |
|---|---|
| **One ecosystem** | SIS, gradebook, special programs, behavior, analytics and enrollment from one vendor, so data lines up across modules. |
| **Special Programs (IEP / 504)** | Case management from referral to IEP, service tracking, state reporting. **504 and IEP alerts appear directly in the teacher's class roster**, so every teacher knows which students have a plan. Forms translate into the parent's language. |
| **Behavior Support (formerly Kickboard)** | PBIS: individual and group rewards, behavior data in one place, real-time analysis by location, time and behavior. ESSA Level II evidence for reducing suspensions and referrals. |
| **Unified Insights** | Analytics across attendance, behavior and coursework, plus MTSS, **early warning and intervention**, and SEL reporting. |
| **Parent and student portals** | Clean, simple portal screens; districts report higher parent logins after switching. |
| **Customization and APIs** | Configurable fields and pages, and integrations with LMS, SPED and phone systems. |

## What users dislike

Reviews on G2, Capterra and Software Advice repeat the same themes:

- **Dated, confusing interface.** Features are hard to find.
- **Too many screens** to reach one piece of information.
- **Steep learning curve**, so staff need training to do simple things.
- Occasional slowness at peak times.

## What we adopted for SCCS

| PowerSchool idea | SCCS implementation |
|---|---|
| Special Programs + roster alerts | **Learning Support** screen for IEP, 504, ELL, BIP, Gifted and Health plans, each with categorized accommodations (presentation, response, setting, timing, behavioral, assistive technology). Plan badges appear on the **Students roster**, on the **student profile**, and **inside the incident form** as soon as a student is picked. |
| Discipline safeguards for students with disabilities | The incident form and Insights warn when a student with an IEP or 504 plan reaches **8 days of out-of-school removal** and flag **day 10**, when IDEA requires a **manifestation determination review**. |
| Behavior Support (PBIS) | **Recognition**: two-tap positive recognitions in six values (Respect, Responsibility, Integrity, Kindness, Leadership, Excellence), a leaderboard, and the school's **positive-to-corrective ratio** against the PBIS 4:1 goal. |
| Unified Insights early warning | **Insights**: a rules-based risk score per student from recent incidents, severity, suspension days, conduct points and MTSS tier, reduced by recognitions. **Every score lists its reasons**, so it starts a conversation instead of labelling a child. |
| Translated plans | The whole UI, including the new screens, is available in English and Spanish. |

## What we deliberately did differently

The most common complaint about large SIS platforms is navigation, so the redesign leans the other way:

- **Command palette (Ctrl/Cmd + K)** finds any student, screen or action from anywhere.
- **One-tap quick actions** on the dashboard (new incident, recognize, learning support, pending, reports, insights).
- **Fewer, calmer screens**: an Apple-style design system with one accent color, system typography, translucent navigation and a floating tab bar on phones.

## Sources

- [PowerSchool SIS on Capterra](https://capterra.com/p/154883/PowerSchool-Student-Information-System/) and [reviews](https://capterra.com/p/154883/PowerSchool-Student-Information-System/reviews/)
- [Chawanakee Unified chooses PowerSchool SIS (Tech & Learning)](https://www.techlearning.com/ed-tech-ticker/9877)
- [PowerSchool Special Programs overview (Linn Benton Lincoln ESD)](https://www.lblesd.k12.or.us/powerschool)
- [Improve support for students with different needs (PowerSchool PDF)](https://pages.powerschool.com/rs/387-SBG-541/images/Improve_Support_for_Students_with_Different_Needs.pdf?version=1)
- [PowerSchool Behavior Support, formerly Kickboard (School Data Leadership)](https://schooldataleadership.org/systems/behavior-discipline-systems/kickboard)
- [PowerSchool SIS on Software Advice](https://www.softwareadvice.com/k-12/powerschool-sis-profile/) and [G2 reviews](https://g2.com/products/powerschool-sis/reviews)
