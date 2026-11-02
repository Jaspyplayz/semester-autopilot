# Study methods: what works and how Semester Autopilot uses it

A short evidence note for the study planner and Coach. Every source below is a real, peer-reviewed paper or chapter with a link. Effect sizes are given where a meta-analysis reports one. As a rough guide, g ≈ 0.2 is small, 0.5 medium, 0.8 large.

## 1. What works, and why

| Method | Evidence | What it is | Why it works |
|---|---|---|---|
| **Practice testing / active recall** | **High.** Rated high utility by Dunlosky et al. (2013). Meta-analyses: g = 0.50 vs restudy, rising to 0.73 with feedback (Rowland, 2014); g = 0.61 over 118 studies (Adesope et al., 2017). | Answer questions from memory instead of rereading. | Each retrieval strengthens the memory and the route back to it. It also shows you what you don't know. Retrieval beat both rereading and concept mapping, on inference questions too, a week later (Roediger & Karpicke, 2006; Karpicke & Blunt, 2011). |
| **Spaced (distributed) practice** | **High.** Rated high utility by Dunlosky et al. (2013). Meta-analysis of 317 experiments (Cepeda et al., 2006); spacing retrieval sessions helps too (Latimier et al., 2021). | Spread study of the same topic over several days instead of cramming. | Forgetting between sessions makes the next retrieval harder, and that effort makes the memory last. Best gap ≈ 10–20% of the time until the test (20–40% for a test in a week, 5–10% for one a year away) (Cepeda et al., 2008). |
| **Successive relearning** (testing + spacing) | **High.** | Practice until you recall each item correctly, then come back on later days and recall it again. | Combines the two strongest effects. A practical rule: 3 correct recalls the first time, then 3 spaced relearning sessions (Rawson & Dunlosky, 2011). |
| **Interleaving** | **Moderate.** g = 0.42 overall, g = 0.34 for math (Brunmair & Richter, 2019). Rated moderate by Dunlosky et al. (2013). | Mix problem types or topics inside one session (A B C B A C) instead of blocks (AAA BBB CCC). | Forces you to choose *which* method fits, which is what the exam asks (Rohrer & Taylor, 2007; Kornell & Bjork, 2008). Works best when the categories look alike. It **didn't help for vocabulary/word lists** (g = −0.39) and was unclear for prose texts. |
| **Self-explanation** | **Moderate.** g = 0.55 across 64 reports (Bisra et al., 2018). Rated moderate by Dunlosky et al. (2013). | Explain each step or idea to yourself: "why does this follow?" | Links new material to what you already know and exposes gaps. |
| **Elaborative interrogation** | **Moderate.** Rated moderate by Dunlosky et al. (2013); strongest when you already know something about the topic. | Ask "why is this true?" about facts and answer it. | Same mechanism as self-explanation, applied to facts. |
| **Dual coding** | **Promising, with caveats.** Theory: Clark & Paivio (1991). Recommended by Weinstein et al. (2018), but *imagery for learning from text* was rated low utility by Dunlosky et al. (2013). | Pair words with a diagram, timeline or flowchart you draw. | Two linked memory codes (verbal + visual) give two ways back in. Only use visuals that carry meaning; decorative ones don't help. |
| **Sleep** | **Strong, mostly correlational for grades.** For 88 college students, sleep quality, duration and consistency in the month *before* exams explained about 25% of the variance in grades. The night before alone didn't predict scores (Okano et al., 2019). | Keep regular, full nights, especially during exam weeks. | Memories are consolidated during sleep, so an all-nighter cuts that step short. |
| **Desirable difficulties** (umbrella idea) | Framework (Bjork & Bjork, 2011). | Spacing, interleaving, testing and varied practice all *feel* harder and *seem* worse while you study, but produce longer-lasting learning. | Explains why students prefer rereading and cramming: they feel fluent. Karpicke & Blunt (2011) found students predicted the wrong winner. |

**Low utility** (Dunlosky et al., 2013): rereading, highlighting/underlining, summarizing (for most students), keyword mnemonics. These are fine as a first pass but shouldn't fill a study block.

## 2. How Semester Autopilot / Coach should use them

### Today's plan (`references/study-plan-template.md`)
- **Default block = recall, not read.** Every topic gets a *learn* block (read/watch once, with a source) followed later by *recall* blocks ("Close the notes, write the 5 key ideas of Lecture 11, then check"). No block should be "reread ch. 7" alone.
- **Space each topic across days.** Schedule a topic's first recall 1–2 days after the learn block, then again at about 10–20% of the days left before the test (e.g. test in 10 days → review gaps of about 1–2 days, then a final pass 2–3 days before). Never put all of a topic's time on one day.
- **Mix topics within a day** for problem-based courses (math, physics, stats, chem, econ): "Mixed set: 2 problems each from Ch. 4, 5, 6". Keep **blocked** practice for vocab/definition-heavy material and for a topic's very first session.
- **The mock test stays.** The template's "last study day = timed mock + redo mistakes" is already practice testing with feedback. Move a smaller mock earlier (about 1/3 of the way in) so it can change the plan.
- **Protect sleep.** Don't plan blocks after a set bedtime, and no "all-nighter" blocks. On the night before a test, the plan says "light review, sleep". The *Short on time?* line cuts low-weight topics before it cuts sleep.

### Quizzes (Coach)
- Generate **short-answer / free-recall questions first**, multiple choice second. Show the correct answer right after each attempt (feedback roughly doubles the testing effect).
- Include **"why" and "explain this step" prompts** (elaborative interrogation, self-explanation), not just definitions.
- For problem courses, **shuffle questions across topics** so the student has to pick the method.
- Where it helps, ask the student to **sketch** a diagram, timeline or flowchart from memory, then compare it with the source (dual coding + recall).

### Progression
- Track each topic/card as `new → learning → reviewing → secure`. A topic is **secure** after 3 correct recalls in one session and correct recall on 2–3 later, spaced days (successive relearning).
- **Wrong answer:** the topic comes back sooner (next day). **Right answer:** the next gap grows, capped so the last review lands 1–3 days before the test date.
- **Weight by deadline.** Use confirmed test dates and weights (Step 1 table) to set the end of the review schedule and decide which topics get spaced first.
- **Show a calibration nudge.** After a quiz, show "you expected X%, you scored Y%". Students tend to overrate rereading, and a visible gap makes the case for recall.

## 3. "Why we use this" (copy for the app or README)

> **Why your plan looks like this**
> Semester Autopilot builds your plan on the study methods with the strongest research behind them.
> - **Test yourself, don't just reread.** Pulling an answer out of memory makes it stick far better than reading it again.
> - **Spread it out.** Short sessions on different days beat one long cram, so each topic shows up more than once before your test.
> - **Mix it up.** For problem courses we shuffle question types, because the exam won't tell you which method to use.
> - **Explain it.** "Why?" questions tie new ideas to what you already know.
> - **Sleep counts.** Your brain locks in what you studied while you sleep, so we never schedule an all-nighter.
>
> It will feel harder than rereading your notes. That's normal: harder practice now means you remember more on test day.

Shorter version (one line, for a tooltip):
> *Built on research: test yourself, spread it out, mix problem types, and sleep. It feels harder, and it works better.*

## Sources
- Dunlosky, J., Rawson, K. A., Marsh, E. J., Nathan, M. J., & Willingham, D. T. (2013). Improving students' learning with effective learning techniques. *Psychological Science in the Public Interest, 14*(1), 4–58. https://doi.org/10.1177/1529100612453266
- Roediger, H. L., & Karpicke, J. D. (2006). Test-enhanced learning: Taking memory tests improves long-term retention. *Psychological Science, 17*(3), 249–255. https://doi.org/10.1111/j.1467-9280.2006.01693.x
- Karpicke, J. D., & Blunt, J. R. (2011). Retrieval practice produces more learning than elaborative studying with concept mapping. *Science, 331*(6018), 772–775. https://doi.org/10.1126/science.1199327
- Rowland, C. A. (2014). The effect of testing versus restudy on retention: A meta-analytic review of the testing effect. *Psychological Bulletin, 140*(6), 1432–1463. https://doi.org/10.1037/a0037559
- Adesope, O. O., Trevisan, D. A., & Sundararajan, N. (2017). Rethinking the use of tests: A meta-analysis of practice testing. *Review of Educational Research, 87*(3), 659–701. https://doi.org/10.3102/0034654316689306
- Cepeda, N. J., Pashler, H., Vul, E., Wixted, J. T., & Rohrer, D. (2006). Distributed practice in verbal recall tasks: A review and quantitative synthesis. *Psychological Bulletin, 132*(3), 354–380. https://doi.org/10.1037/0033-2909.132.3.354
- Cepeda, N. J., Vul, E., Rohrer, D., Wixted, J. T., & Pashler, H. (2008). Spacing effects in learning: A temporal ridgeline of optimal retention. *Psychological Science, 19*(11), 1095–1102. https://doi.org/10.1111/j.1467-9280.2008.02209.x
- Latimier, A., Peyre, H., & Ramus, F. (2021). A meta-analytic review of the benefit of spacing out retrieval practice episodes on retention. *Educational Psychology Review, 33*(3), 959–987. https://doi.org/10.1007/s10648-020-09572-8
- Rawson, K. A., & Dunlosky, J. (2011). Optimizing schedules of retrieval practice for durable and efficient learning: How much is enough? *Journal of Experimental Psychology: General, 140*(3), 283–302. https://doi.org/10.1037/a0023956
- Brunmair, M., & Richter, T. (2019). Similarity matters: A meta-analysis of interleaved learning and its moderators. *Psychological Bulletin, 145*(11), 1029–1052. https://doi.org/10.1037/bul0000209
- Rohrer, D., & Taylor, K. (2007). The shuffling of mathematics problems improves learning. *Instructional Science, 35*(6), 481–498. https://doi.org/10.1007/s11251-007-9015-8
- Kornell, N., & Bjork, R. A. (2008). Learning concepts and categories: Is spacing the "enemy of induction"? *Psychological Science, 19*(6), 585–592. https://doi.org/10.1111/j.1467-9280.2008.02127.x
- Bisra, K., Liu, Q., Nesbit, J. C., Salimi, F., & Winne, P. H. (2018). Inducing self-explanation: A meta-analysis. *Educational Psychology Review, 30*(3), 703–725. https://doi.org/10.1007/s10648-018-9434-x
- Clark, J. M., & Paivio, A. (1991). Dual coding theory and education. *Educational Psychology Review, 3*(3), 149–210. https://doi.org/10.1007/BF01320076
- Weinstein, Y., Madan, C. R., & Sumeracki, M. A. (2018). Teaching the science of learning. *Cognitive Research: Principles and Implications, 3*, 2. https://doi.org/10.1186/s41235-017-0087-y
- Okano, K., Kaczmarzyk, J. R., Dave, N., Gabrieli, J. D. E., & Grossman, J. C. (2019). Sleep quality, duration, and consistency are associated with better academic performance in college students. *npj Science of Learning, 4*, 16. https://doi.org/10.1038/s41539-019-0055-z
- Bjork, E. L., & Bjork, R. A. (2011). Making things hard on yourself, but in a good way: Creating desirable difficulties to enhance learning. In M. A. Gernsbacher et al. (Eds.), *Psychology and the real world* (pp. 56–64). Worth. [PDF](https://bjorklab.psych.ucla.edu/wp-content/uploads/sites/13/2016/04/EBjork_RBjork_2011.pdf)
