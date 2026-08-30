# Learning Paths — design notes

A Learning Path is the long-term layer: a subject planned over a semester or a
year. Courses stay short and fresh; the path holds the arc.

## The model

```
Learning Path (term_plan)          "Algebra Adventures, Sep–Jun, 3×30min/week"
 ├─ enrollment per learner         lens + personal instructions per learner
 └─ milestones (plan_milestones)   the waypoints, in order, with target dates
     ├─ project ideas              hands-on proof of skill
     ├─ resources                  curated links + suggestions (guide adds URLs)
     └─ course link                generated just-in-time, auto-linked
```

## Why this shape (the decisions worth remembering)

1. **Plan the year upfront; generate courses just-in-time.** One giant
   year-long course would go stale, cost a fortune in one call, and lose
   quality at the tail. The AI designs the *sequence* now; each milestone's
   course is generated the week it's needed — with everything learned since.
2. **Dates are the server's job, not the AI's.** The AI sequences topics; the
   server spreads target dates deterministically across the term. LLMs are
   bad at calendars.
3. **Personalization is an override layer.** One shared path; each learner's
   enrollment carries a lens + instructions. Same destination, different
   route — "specialized learning path per learner" without duplicating plans.
4. **No AI-fabricated URLs.** The AI names resources ("Khan Academy:
   fractions unit"); the guide adds real links. Nothing 404s.
5. **Progress is derived from real work** — lesson completions on linked
   courses — never self-reported.

## What this enables next

- **Quarterly reports:** per-term snapshots (completed milestones, accuracy,
  active days, hours) + an AI narrative the guide edits — printable. The data
  all exists already; this is a rendering job.
- **Calendar + notifications (Trinacle appointment patterns to port):**
  - events table with status + date ranges (like Trinacle's Appointments lib)
  - a reminder sweep (Trinacle's "tomorrow:" email pattern) → weekly guide
    digest + optional learner nudges via SMTP env vars (self-host friendly,
    no external service dependency)
  - external calendar event ids for ICS/Google export hooks
- **Auto-generation:** when a milestone's target week arrives and no course
  exists, the job sweeper can offer/queue generation automatically.

## School-class features this maps onto

Roster = enrollments · Term = plan dates · Syllabus = milestones · Homework
= lesson exercises + projects · Grading windows = reporting periods ·
Parent/teacher conferences = quarterly report printouts. A co-op or small
school runs the same structures — only the invite/guide model widens later.
