# The pedagogy behind Well of Wisdom

Why the app does the things it does, with the studies behind each choice. Written
for educators and for parents who want to know this is not another quiz app.

Short version: the app is built on four findings that are old, well replicated
and mostly ignored by software.

1. **Spacing beats cramming.** Review spread over days beats the same review in
   one sitting.
2. **Trying to explain something is how you find out you do not understand it.**
3. **A tutor that withholds the answer teaches more than one that gives it.**
4. **A person has to read the work.** Feedback is the strongest lever in
   education and a machine should not be the one holding it.

Everything else in the app follows from those four.

## 1. Spaced review

**What the app does.** Every graded exercise enters a schedule. A correct answer
moves it out: 1 day, 3 days, 7 days, then longer. A wrong answer brings it back
the same day. The learner sees one queue, across all their courses, called
"practice due now".

**Why.** The spacing effect is one of the oldest results in experimental
psychology. Ebbinghaus described it in 1885 with his own recall experiments.
Cepeda and colleagues reviewed 254 studies in 2006 and found spaced practice
beats massed practice in the large majority of them, with the best gap growing as
the test gets further away. Dunlosky and colleagues rated practice testing and
distributed practice as the two highest utility techniques out of ten they
reviewed, meaning they work across ages, materials and settings.

**Why it matters here.** Most platforms do not schedule review at all. The
learner decides what to revisit, and a child revisits what they already find
easy. The schedule decides instead.

**Citations.**
- Ebbinghaus, H. (1885). *Memory: A contribution to experimental psychology.*
- Cepeda, N. J., Pashler, H., Vul, E., Wixted, J. T., & Rohrer, D. (2006).
  Distributed practice in verbal recall tasks: A review and quantitative
  synthesis. *Psychological Bulletin*, 132(3).
- Dunlosky, J., Rawson, K. A., Marsh, E. J., Nathan, M. J., & Willingham, D. T.
  (2013). Improving students' learning with effective learning techniques.
  *Psychological Science in the Public Interest*, 14(1).
- Roediger, H. L., & Karpicke, J. D. (2006). Test-enhanced learning.
  *Psychological Science*, 17(3).
- Adesope, O. O., Trevisan, D. A., & Sundararajan, N. (2017). Rethinking the use
  of tests: A meta-analysis of practice testing. *Review of Educational
  Research*, 87(3).
- Rohrer, D., & Taylor, K. (2007). The shuffling of mathematics problems improves
  learning. *Instructional Science*, 35(6). (On mixing problem types rather than
  blocking them.)

## 2. Self-explanation

**What the app does.** Some exercises are a written self-check: there is no
machine-checked answer. The learner writes the reasoning, sees a model answer
afterwards, and the work is visible to their guide. The "why was I wrong" button
walks through the learner's own mistake rather than showing a solution.

**Why.** Chi and colleagues found in 1989 that learners who explain worked
examples to themselves, out loud or in writing, learn more than those who only
read them, and in 1994 that prompting the explanation causes the gain rather than
merely correlating with it. Bisra and colleagues meta-analysed 69 studies in 2018
and found a moderate overall effect, with stronger results when the prompt asks
for the reasoning rather than for a restatement of the steps.

**Why it matters here.** A multiple choice answer can be right for a wrong
reason. Writing it down makes the gap visible to the learner first and the guide
second, and it gives the AI something real to work with when the learner asks for
help.

**Citations.**
- Chi, M. T. H., Bassok, M., Lewis, M. W., Reimann, P., & Glaser, R. (1989).
  Self-explanations: How students study and use examples in learning to solve
  problems. *Cognitive Science*, 13(2).
- Chi, M. T. H., de Leeuw, N., Chiu, M.-H., & LaVancher, C. (1994). Eliciting
  self-explanations improves understanding. *Cognitive Science*, 18(3).
- Bisra, K., Liu, Q., Nesbit, J. C., Salimi, F., & Winne, P. H. (2018). Inducing
  self-explanation: A meta-analysis. *Educational Psychology Review*, 30(3).
- Fiorella, L., & Mayer, R. E. (2016). Eight ways to promote generative learning.
  *Educational Psychology Review*, 28(4).

## 3. Tutoring strictness

**What the app does.** The tutor has three modes per learner: hints only, guided,
and full explanation. In hints mode the answer is not in the model's context at
all. It is not told to keep quiet: the correct answer never reaches the prompt, so
no jailbreak can extract it. A guide must choose the modes that reveal more.

**Why.** Bloom's 1984 "two sigma" paper showed one to one tutoring lifting
average students above the 98th percentile of a conventional class, and set off
forty years of work on what tutoring actually consists of. VanLehn's 2011 review
of that literature found the large effects come from interaction, not from the
tutor's knowledge. Kulik and Fletcher (2016) and Ma and colleagues (2014) both
found intelligent tutoring systems produce moderate gains, real but smaller than
a person.

The strictness setting matters because of a well documented failure mode. Aleven
and Koedinger (2000) showed students are poor judges of when they need help, and
Roll and colleagues (2011) showed that help-seeking behaviour can be improved by
feedback about it. Baker and colleagues (2004) named the other side of it:
"gaming the system", where a learner clicks for help until the answer appears.
A tutor that can be talked into telling you is a tutor that teaches a child to
ask twice.

Kirschner, Sweller and Clark (2006) are the counterweight we keep in the design:
minimal guidance does not work for novices. Strictness has to start low for a new
topic and open up as the learner shows what they can do.

**Citations.**
- Bloom, B. S. (1984). The 2 sigma problem. *Educational Researcher*, 13(6).
- VanLehn, K. (2011). The relative effectiveness of human tutoring, intelligent
  tutoring systems, and other tutoring systems. *Educational Psychologist*, 46(4).
- Kulik, J. A., & Fletcher, J. D. (2016). Effectiveness of intelligent tutoring
  systems: A meta-analytic review. *Review of Educational Research*, 86(1).
- Ma, W., Adesope, O. O., Nesbit, J. C., & Liu, Q. (2014). Intelligent tutoring
  systems and learning outcomes: A meta-analysis. *Journal of Educational
  Psychology*, 106(4).
- Aleven, V., & Koedinger, K. R. (2000). Limitations of student control: Do
  students know when they need help? *Intelligent Tutoring Systems*.
- Roll, I., Aleven, V., McLaren, B. M., & Koedinger, K. R. (2011). Improving
  students' help-seeking skills using metacognitive feedback. *Learning and
  Instruction*, 21(2).
- Baker, R. S., Corbett, A. T., Koedinger, K. R., & Wagner, A. Z. (2004). Off-task
  behavior in the cognitive tutor classroom: When students game the system. *CHI*.
- Kirschner, P. A., Sweller, J., & Clark, R. E. (2006). Why minimal guidance
  during instruction does not work. *Educational Psychologist*, 41(2).
- Sweller, J., & Cooper, G. A. (1985). The use of worked examples as a substitute
  for problem solving in learning algebra. *Cognition and Instruction*, 2(1).

## 4. Guide review

**What the app does.** No machine written feedback reaches a learner. When a
learner hands in a project, the AI drafts criteria based on the guide's own
rubric, the draft goes to `ai_feedback` (a column no learner route reads), the
guide edits it and sends it back. The same rule covers courses: generated courses
arrive as drafts and a person publishes them.

**Why.** Feedback is one of the strongest influences on achievement (Hattie and
Timperley, 2007), and it is also easy to get wrong. Kluger and DeNisi's 1996
meta-analysis found that in about a third of the studies they reviewed, feedback
made performance worse, usually when it was about the person rather than the
work. Shute (2008) lays out what separates formative feedback that helps from
feedback that does not: it is specific, it is about the task, and it arrives
while it can still be used.

Three consequences in the app, all deliberate:

- The AI writes a draft, not a verdict. A verdict from a model about a child's
  essay is exactly the kind of feedback that does damage.
- Feedback is "news" until the learner has seen it, and the guide can see when it
  was read.
- Formative assessment is treated as information for teaching (Black and Wiliam,
  1998), not as a grade to file.

**Citations.**
- Hattie, J., & Timperley, H. (2007). The power of feedback. *Review of
  Educational Research*, 77(1).
- Kluger, A. N., & DeNisi, A. (1996). The effects of feedback interventions on
  performance. *Psychological Bulletin*, 119(2).
- Shute, V. J. (2008). Focus on formative feedback. *Review of Educational
  Research*, 78(1).
- Black, P., & Wiliam, D. (1998). Assessment and classroom learning. *Assessment
  in Education*, 5(1).

## Smaller choices that follow the same rule

- **Mastery before moving on.** A lesson shows a mastery star when its work is
  done. Mastery learning has sixty years of support (Bloom, 1968; Keller, 1968)
  and it is why the path gates the boss on the lessons before it.
- **Misconceptions named, not just marked wrong.** The app looks for the pattern
  behind a run of wrong answers and names it. Distractors built from known
  misconceptions diagnose rather than merely score (Sadler, 1998).
- **Reading aloud, and rewriting to a reading level.** Narration and a
  per-learner reading font support readers who are not served by a wall of text.
  Mayer's multimedia work is the general case: the same content, delivered two
  ways, is learned better than one.
- **No public leaderboards, no punishing streaks.** A streak counts days the
  learner worked, and a missed day does not erase a term of work. Gamification
  helps most when it supports competence and autonomy rather than controlling the
  learner, which is the consistent finding in the self-determination literature
  (Ryan and Deci) and in the meta-analysis by Sailer and Homner (2020).
- **Time pressure is off by default.** Boss fights have a clock because a boss
  without one is a form submission. Everything else can be answered slowly, and
  the guide can turn strictness down.

**Citations.**
- Bloom, B. S. (1968). Learning for mastery. *Evaluation Comment*, 1(2).
- Keller, F. S. (1968). Goodbye, teacher. *Journal of Applied Behavior Analysis*,
  1(1).
- Sadler, P. M. (1998). Psychometric models of student conceptions in science.
  *Journal of Research in Science Teaching*, 35(3).
- Mayer, R. E. (2014). *The Cambridge handbook of multimedia learning* (2nd ed.).
- Ryan, R. M., & Deci, E. L. (2000). Self-determination theory and the
  facilitation of intrinsic motivation. *American Psychologist*, 55(1).
- Sailer, M., & Homner, L. (2020). The gamification of learning: A meta-analysis.
  *Educational Psychology Review*, 32(1).

## Notes on this page

- No links are given on purpose. A dead or wrong DOI is worse than none in a
  grant application: search the title, and read the current version.
- Volume and issue numbers are given where they are stable. Check the record
  before quoting a page number.
- This page describes what the app intends. Where the code and this page
  disagree, the code is what a family experiences, so open an issue.
