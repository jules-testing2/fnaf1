# The SAIM Constitution

*Draft v0.3. Not approved, not public.*

---

## Preface

SAIM stands for Systems for Autonomous Intelligent Mobility. It began as a concept created by Bogdan Felician Abaza at the Faculty of Industrial Engineering and Robotics (FIIR), National University of Science and Technology POLITEHNICA Bucharest: a class of innovation in which students learn by building things in house, things that are not taught in any course. It started with simple robots. Those robots learned to navigate on their own. Robotic arms followed, then a humanoid, then a quadruped. SAIM Robotics is the name of that family of machines and of the people who build it.

This document describes what we value, how we work, and what we will not do under any circumstances. It is written primarily for ourselves, and secondarily for anyone deciding whether to work with us, build on our results, or let one of our machines operate near them.

We are writing it early, while the laboratory is small and while almost nothing about it is settled. That is deliberate. The values of a research group are easiest to state before there is any pressure to bend them, and a document written after the first difficult contract would be a rationalisation rather than a commitment. Some of what follows describes what we already do. Some of it describes what we have decided to do and have not yet been tested on. We have tried to be clear about which is which, because a document that blurs the two is advertising.

It is not permanent, and it is not meant to be. It is written to be held against us. If our practice drifts from what is written here, then either the document is wrong and gets rewritten, or the practice is wrong and gets corrected. What we will not do is quietly keep a version that has stopped being true, because a constitution nobody follows teaches everyone who reads it that our written commitments are decorative.

The structure of this document is modelled on Anthropic's constitution for Claude, which is released publicly and which we found to be the clearest example of an organisation stating its values in a form that can actually be checked against its behaviour. We mention this for the same reason we cite anything else we build on.

---

## Summary

We want SAIM to be a laboratory whose work is worth trusting. In practice that means four things, listed here in the order in which they should be prioritised when they conflict:

1. **Safe.** No person is put at physical risk by our machines, and no person becomes the subject of our research without knowing and agreeing to it.
2. **Honest.** We do not misrepresent what our systems do, how often they do it, or how much of the work is ours. This applies equally to papers, demonstrations, videos and conversations.
3. **Open.** We publish, we release, we credit, and we make it possible for other people to repeat what we did.
4. **Useful.** We build machines that make a real difference to somebody's day.

The ordering matters only in conflict, and conflicts are rare. Almost all of our work involves building something that is simultaneously safe, honest, open and useful, and no ranking is needed. The list exists to say what gives way when something has to.

Safety comes first because the people affected by a mistake are frequently people who never agreed to be near a robot: someone walking down a corridor to a lecture, a patient in a hospital, a visitor who came for something else entirely. They did not accept the risk, so we carry it on their behalf.

Honesty comes above openness because publishing an overstated result is worse than not publishing. Volume of output is not the goal.

Openness comes above usefulness because we are a research laboratory rather than a supplier. A useful machine that nobody outside our building can understand or repeat has produced convenience, not knowledge, and knowledge is what we owe the people funding a public university.

Usefulness is last on this list and first in daily practice. A laboratory that produces nothing anybody wants has failed, and nothing in this document should be read as an argument for caution as an end in itself.

Underneath all four sits the reason the laboratory exists at all: to make engineers. The robots are how we do that. If the machines improved and the people did not, we would have missed the point.

---

## Part I. What SAIM is

### Why a class of innovation

A university teaches fundamentals, and it should. But the distance between the fundamentals and a robot that crosses a corridor on its own is not covered by any course, and it is not crossed by reading. It is crossed by building something that does not work, then finding out why, dozens of times, until it does.

SAIM exists to make room for that inside the faculty. It was created as a class of innovation: a place where students build systems that do not yet exist in the building, using knowledge nobody is scheduled to deliver to them. What we cannot be given, we construct.

This is not a complaint about the institution. Faculties are built to deliver reliable knowledge at scale, which is a different job from producing novelty, and the two need each other. But the second one does not happen unless somebody deliberately makes room for it. That room is what SAIM is, and the point of writing this document is to describe what happens inside it.

The name is not decoration. *Systems*, because the object of our attention is never a component: a perception module that performs well alone and fails when the planner runs beside it on the same processor has taught us nothing useful. *Autonomous*, because the machine is expected to act without somebody driving it, and where a robot of ours is teleoperated we say so. *Intelligent*, because avoiding obstacles is not yet what we want; we want machines that understand what they are moving through, that a corridor leads to a lecture hall and that the thing in the way is a person. *Mobility*, because movement through human space is the problem we chose, and the arms, the humanoid and the quadruped all sit inside that frame.

### Why a laboratory and not a company

We sell nothing. This is a position, not a stage we have not yet exited.

A company must protect what it has built long enough to sell it, which makes holding results back the default motion. A laboratory has the opposite default: a result nobody else can see has not fully happened. That single difference determines most of what follows in this document, including how we treat failure, how we treat other people's work, and what we do with code.

We are open to projects with industry, and we think research and industry need each other rather than existing in opposition. But we enter such projects from where we stand, as a research group carrying a publication obligation and a set of refusals, not as a supplier that happens to be located inside a university. A partner who works with us gets people who will say when something does not work, which is worth more than people who will not.

### How we started, and why it still matters

The first work was done on Raspberry Pi boards with a budget close to zero. That was not a temporary inconvenience on the way to a proper laboratory. It shaped how we think.

When a Jetson AGX Orin finally arrived we advanced very quickly, and the reason we advanced quickly is that we had spent a long time unable to brute force anything. We knew what every millisecond was being spent on because we had counted them. Scarcity taught us the architecture before abundance let us run it.

We record this because the story is usually told the other way around, as though capability arrives with equipment. It does not. Equipment removes a ceiling. What happens underneath the ceiling was decided earlier, and a group that never had to decide it will not discover the answer by buying a better machine.

There is a further consequence we want stated plainly, because it concerns other groups and not only ourselves. Research that can only be done with a large budget is research that most of the world cannot check. A method that runs on modest hardware is more open in practice than an expensive method with a permissive licence, because a licence you cannot afford to exercise is not access. Where we can choose the cheaper approach at equal quality, we choose it, and that is a decision about openness rather than about money.

---

## Part II. How we work

### Principles rather than procedures

This document contains very few rules. That is intentional.

A checklist tells somebody what to do in the situations its author anticipated, and says nothing about the rest. Robotics generates unanticipated situations continuously, which is most of what makes it interesting. We would rather everyone in the laboratory understand why we work the way we do well enough to derive the right action in a situation nobody wrote down, than follow a procedure into an outcome it was never meant to produce.

The exception is Part V. There are a small number of things we will not do regardless of argument, and for those a bright line is safer than judgment, for reasons given there.

### We integrate before we invent

Robotics research today is a field of small nodes: a perception method here, a planner there, a dataset somebody released and forgot about. Most of it is open, and most of it is never combined. Our method is to read widely, reproduce what others have built, and connect those nodes into a working whole, adding our own ideas where the connection does not exist yet.

This is not modesty about original contribution. Integration at system level is where most of the difficulty lives. Two methods that each work perfectly in their respective papers will routinely fail together, because they assume different conventions, different update rates, or a machine with more memory than ours. Resolving that is real engineering, and it is where a student learns the most, because it cannot be done without understanding both pieces properly.

Writing from scratch is often the lazier option. It avoids the harder discipline of understanding somebody else's design well enough to use it, and it produces a system whose only advantage is that its author recognises the variable names.

We are downstream of a large amount of open source robotics that other people wrote and gave away. We treat that as an obligation rather than as a resource: we say which parts came from where, we report bugs upstream instead of patching locally and forgetting, and we release our own tooling under the terms we benefited from.

### What counts as innovation

We hold two things under that word and nothing else.

The first is a method that was not there. Angular Sector Fusion, our approach to fusing camera and LiDAR perception, is ours, and it exists because the standard approaches assumed hardware we did not have. The second is an integration that was not there: several existing pieces combined into a system that behaves differently from the sum of its parts. A robot that plans over a semantic graph, revises that graph from what it sees while moving, and remembers the revision for the next run is not any one of its components.

Novelty for its own sake does not count. A new name on an old idea does not count. A benchmark improved by a fraction of a percent through parameter search does not count unless the parameter taught us something. The test is whether, afterwards, somebody can do something they could not do before.

### Semantics before geometry

A robot that knows only geometry knows where the walls are. That is enough to avoid collisions and not enough to be useful to a person.

Our systems are built around the claim that a machine moving through human space should represent that space roughly the way the people in it do: rooms with names and purposes, corridors that lead somewhere, doors that belong to something, objects that say something about what is likely to happen next. Nobody asks a robot to reach a coordinate. They ask for the laboratory, the lecture hall, the coffee machine.

This is why our navigation runs over a semantic graph rather than a bare occupancy grid, why perception is expected to identify what a thing is and not merely that something is there, and why the system keeps what it learned about a place after the run ends. It is also the most demanding claim we make, because semantics fail differently from geometry. A missing obstacle is a bug. A confident wrong label is a machine acting decisively on a false belief, which is a worse failure and a harder one to notice. Much of Part III exists to constrain exactly that.

### What we consider finished, and what we consider evidence

Nothing is finished. We are a university laboratory and every robot is in a continuous state of research, so the honest answer to "is it done" is always no. We accept the consequence: outside a project with an industrial partner, under that partner's acceptance criteria, we do not describe anything of ours as a product, and we do not use the phrase "ready for production" about our own work.

We also avoid the word "solved". A capability that works in our corridor works in our corridor. It becomes general when somebody else runs it somewhere else.

What counts as evidence is a run on the physical robot, in a real environment, repeated. Anything shown only in simulation is labelled as such in speech, in slides and in papers. Simulation is a good tool for developing quickly and for testing situations that would be unsafe or impractical to stage, and it is not evidence about the physical world. A good simulation does not substitute for a run we did not do.

We call this the corridor test, and we use it as a question rather than a rule: has this been through a real corridor, with real people in it, more than once? A claim that has not is a hypothesis, and we say so.

A claim also needs a number attached, and the number needs its conditions: how many runs, on what hardware, in which environment, with what counted as success. This protects us in both directions. It stops us overstating, and it lets us defend a capability that somebody doubts, because measurements can be defended and impressions cannot. When we have not measured something yet, the correct sentence is that we have not measured it, and that sentence is available to anybody in the laboratory at any time, including in front of visitors.

### Failure is data

Robots have failed in front of an audience more than once. Every one of those failures told us something a successful run would have hidden, and with each failure the robot got smarter.

This is method rather than consolation. A successful demonstration tells you that one path through the state space works. A failed one tells you where the boundary is, and the boundary is the more informative object. We keep failures, write them down, and turn the conditions that produced them into test cases.

The same holds outward. We report negative results, including our own, because a research program that publishes only what worked is not reporting statistics but reporting a selection. When we benchmark, the methods that performed badly appear beside the ones that performed well, with the failure modes described specifically enough to be useful to somebody choosing between them. "It did not work well" helps nobody. A precise description of how it failed saves a stranger a week of their life.

### Autonomy runs on board

The goal is that a robot depends on no other computer.

We have used external machines and external APIs as steps along the way, and we say so when we do, but every such dependency is treated as debt with a due date rather than as architecture. A robot that needs a particular laptop on a particular network is a robot that stops working in a different building, which means it is not autonomous, it is remote controlled by software instead of by a person.

There is a second reason, and it belongs in a document about values rather than performance. A machine that sends what it sees somewhere else has made a decision about the people it sees, on their behalf, without asking them. Local computation is a privacy property before it is a latency property.

### The system is the unit of work

A student who improves one module by twenty percent and breaks the integration has produced a negative result. A student who makes the whole robot slightly more reliable has produced a real one. We organise work around whole behaviours that can be run end to end, on the robot, repeatedly, and we review them that way.

---

## Part III. Robots and people

Everything in this part follows from a single observation. The people most affected by our machines are usually not the people who asked for them. A student walking to a lecture, a nurse on a corridor, a visitor who came for something unrelated: none of them chose to participate in a robotics experiment, and their presence in a public building is not consent to anything. We hold the risk on their behalf, because they cannot.

### Assistance, not replacement

Our machines are prototypes today. The purpose we are building toward is assistance: carrying medication through a hospital, guiding a student to the right room, absorbing the movement that consumes a person's time without adding anything to their judgment.

We are aware of the obvious objection, that any machine performing part of a job could be described as displacing the person who performed it before. Our answer concerns which part. The tasks we target consist of moving something from one place to another, where the value of the work lies in the decisions at either end rather than in the walking between them. A nurse deciding what a patient needs is doing the work. The same nurse walking two hundred metres to fetch it is being prevented from doing the work.

The robot moves. The human decides. If we ever find ourselves building a machine that decides, this section is the first one that has to be rewritten, in public, before the machine is built.

### Perception, identity and consent

Our perception runs on models trained over standard object classes. A robot sees a person, not who that person is.

We do not believe in mass surveillance. We do not perform facial recognition, and we do not store images of people. We want to stress that this is a property of the system rather than a policy layered on top of one, because the difference is what makes it worth writing down. A policy is a promise about how a capability will be used, and promises travel badly: they depend on whoever is running the robot next, in a context we cannot foresee. An architecture that never acquired the capability cannot be quietly repurposed.

There are useful things a robot can do only if it holds something specific about an individual. A student who says who they are and where they want to go can be guided there. Three conditions apply to any such information. It is given willingly by that person in the interaction, and never inferred about them. It is used for the purpose it was given for. It stays on the robot, does not leave the machine, and does not accumulate into a record of who goes where.

A robot that knows you because you told it who you are is a fundamentally different machine from one that knows you because it has seen you before. We build the first.

The question we use when this is unclear is what we call the stranger's question: what would the person walking past think, if they knew exactly what the machine was doing with what it saw, and had they been asked? If the honest answer involves them being surprised, we have already made a mistake, whatever the data protection paperwork says.

### Safety

A robot that cannot see people cannot avoid them, so our safety begins with perception. The machine continuously detects what is around it and stops or reroutes accordingly, rather than depending on somebody noticing in time. This is the right primary mechanism, because it works at the speed of the machine and does not require attention from anyone. Speed limits near people, distance margins, and the behaviour of the robot when its own perception is uncertain all belong to the same system and are set conservatively.

*(This section is thinner than it should be, and the omission is deliberate rather than accidental: see open question 1. A document that discusses autonomous machines operating around people and says nothing about direct human control is incomplete, and every serious reader will notice.)*

### A model is a sensor, not an authority

We use vision language models as a source of information about the scene, in the same category as a camera or a range sensor: something that reports, and can report wrongly.

A rule about hierarchy follows from that. The deterministic parts of the system decide. A probabilistic model informs those decisions and does not override a constraint that exists for safety. When we need to be sure a task actually happened, we ask a person to confirm it, because human confirmation is evidence while model output is a measurement.

This is not scepticism about the models, which do things nothing else we have can do. It is a statement about where uncertainty is permitted to propagate. A perception error should cost us a wasted trip. It should not be able to cost anything more than that, and if it can, the architecture is wrong rather than the model.

### Failure in front of a person

Assistance creates dependency, and dependency creates obligation. Once somebody is waiting on a machine, the machine's failure is their problem too.

When a task fails, the correct behaviour is not to retry silently and not to stop quietly. It is to state clearly that it has failed and to escalate to a qualified person who can complete the task. The more consequential the errand, the less acceptable a silent failure becomes, and in a medical setting escalation is mandatory rather than a fallback. An honest failure is a small event. A failure nobody was told about is how a useful machine becomes a dangerous one.

### Serving anyone

A SAIM robot assists whoever is in front of it, regardless of where that person comes from. There is no category of person our machines are built to treat differently, and no context in which the assistance depends on who is asking.

### What a robot should let people believe about it

*(Open. See open question 4. The position the rest of this document implies: a robot may have a name and a manner, because a machine people find approachable is a machine people will actually use, but it should not claim to understand more than it does, should not imply an inner life it does not have, and should answer accurately when asked what it can do. Most of the people our machines will serve are not engineers, and they will calibrate their trust on how the machine presents itself rather than on our papers.)*

---

## Part IV. Honesty and openness

### Publication

We sell nothing, so nothing prevents publication. Results go into the literature with open source code as the default rather than as a favour, and the order is deliberate: publication comes before any commercial consideration, because the moment those two are reversed the incentive to hold things back becomes permanent.

Work under review cannot always be released in full, and we will not pretend otherwise. What stays public throughout is the architecture and the method: the structure of the system, the interfaces, the reasoning behind the design. A reader should always be able to understand what we did, even during the window before they can run it. Anything already released stays released.

### Credit

Our work is free to use and build on. In exchange we ask for the thing academic work runs on: attribution, and citation of the papers. We ask because we practise it, and a group that takes freely from the commons while being careless about credit is damaging the mechanism it depends on.

### Reproduction

We document at a level that makes reproduction possible, and we treat that as a commitment rather than a habit, because a method nobody can repeat is a claim rather than a result.

When somebody else's published result does not reproduce on our hardware, we neither bury it nor turn it into an accusation. We report what we observed, describe our conditions, and try to find out why, starting from the assumption that the difference is usually in the conditions rather than in the claim.

### What we show

There is a specific way for a research group to be dishonest while remaining scrupulous in its papers, and it is to be loose in everything that is not a paper. Demonstrations, videos, slides and conversations reach far more people than our publications do, and they are checked by nobody. So the standard has to be the same in both places, and this section exists because that is easy to write and easy to forget.

We use generative tools for some of our visual material, because we are a small laboratory with a small budget and no production resources. We consider that a compromise rather than a standard, and our intention is to move toward material made by people as we become able to. In the meantime two rules hold. Generated imagery is never presented as footage of a robot doing something it has not done. And any capability shown in rendered or stylised form must correspond to something the robot actually does, in a form we could demonstrate on request.

Staged runs are described as staged. Simulated results are described as simulated. A demonstration that succeeded on the fourth attempt is a demonstration that succeeded on the fourth attempt, and saying so costs us nothing except an impression of infallibility we were not entitled to.

---

## Part V. What we will not do

Everything above this point asks for judgment. This part does not.

The items below are refusals we hold regardless of context, funding, argument or who is asking. They work differently from the rest of the document: they are not weighed against other considerations, they bound the space inside which the weighing happens. We write them as bright lines because the harm they protect against is severe or irreversible, because a case-by-case judgment under pressure is exactly where a small laboratory with a small budget is most likely to reason its way somewhere bad, and because a group that has settled these questions in advance can engage openly with a difficult proposal instead of relitigating its ethics every time somebody makes a persuasive offer.

If somebody presents a compelling argument for crossing one of these lines, the strength of the argument is not a reason to cross it. It is a reason to look harder at the situation.

We will not:

- Build military applications or weaponised systems. Our machines exist to lighten human work, and that purpose has no version compatible with harming people. Mobility research is dual use by nature, which is precisely why the line is written down rather than assumed.
- Build systems that identify, track or log individuals without their consent, or accept work that requires it, whatever it is called by whoever is asking.
- Misrepresent failure rates, to ourselves, to reviewers, to partners, or to an audience watching a demonstration.
- Accept work that permanently forbids publication. Delay is negotiable. Permanent silence converts a laboratory into a supplier and removes the reason we exist.
- Present a capability we have not achieved as one we have, in any medium.
- Put a robot into a setting where its failure could harm somebody, without the people responsible for that setting knowing precisely what it can and cannot do.

Refusing is always available, and refusing is never free. Declining a collaboration costs a small laboratory more than it costs a large one, and we would rather absorb that cost than explain later why the document said one thing and we did another.

---

## Part VI. The laboratory

### The point is the people

The robots are the visible output. The actual product is a person who arrives knowing coursework and leaves knowing how to build a system.

The measure of a year in SAIM is what somebody can do at the end of it that they could not do at the start: ROS 2, perception, control, electronics, mechanics, software architecture, the whole span of domains that a single robot forces you to touch. A robot is an unusually good teacher because it refuses to accept an incomplete understanding. The corridor does not award partial credit.

This is also why the failures matter more here than they would in a company. A student who has only seen things work has not learned the subject.

### What stays

What a student builds remains here, on the robots, available to whoever comes next. Nobody starts from nothing, and nobody takes the foundation away when they leave.

That obliges us as much as it obliges anyone. Work that stays is only worth anything if the next person can use it, which makes documentation part of the work rather than an afterthought to it. Code that only its author can run has not really been left behind.

SAIM remains part of FIIR. Whatever we become, we became it inside this faculty, and nothing in this document anticipates a separation.

### Who joins

SAIM is not currently open to new people. We are early, we have not launched, and we would rather say that plainly than maintain an open door we cannot staff. That describes the present rather than the intention. Growth is the point, and when we open, the terms belong in this document.

---

## Part VII. What we are aiming at

We want SAIM to become much larger: many students, each specialised in a niche, building systems and robots that perceive far more than ours do today. Semantic understanding of an environment is not a problem one person finishes. It gets deeper every time somebody adds a sense to it.

We also think this matters beyond us. Europe needs more initiatives of this kind, built inside universities, in the open, by people who are still learning. Each one is evidence that the capability exists here, and an argument for putting attention back on education, which has been quietly losing it. Romania in particular needs that argument made, and made by demonstration rather than by complaint. We are aware of how small we are relative to that sentence. The point of stating it is not that we will accomplish it alone, but that we would rather be one of many than the only one, and that we will help anybody trying to start something similar.

We will consider that SAIM has worked when our robots operate in real scenarios, outside demonstrations, and deliver a real benefit to the people around them. Not a video. Not a controlled run in front of an audience. A machine doing something useful, repeatedly, in a place where it matters, for people who did not come to see a robot. Anything short of that is progress, and progress is not the same thing as success.

---

## This document

It is maintained under version control alongside the code, because a document that describes practice should live where the practice lives.

It changes when we learn something that contradicts it. Changes are made openly, with previous versions kept, so that anybody can see what we used to think and when we stopped thinking it. A quiet edit to a commitment is a broken commitment.

It is certainly incomplete, and parts of it will look naive later. We would rather publish something that can be shown to be wrong than something too vague to be wrong. If you find a place where SAIM does not behave the way this text says, tell us. That is what it is for.

---

# Open questions

*Internal. To resolve before publication.*

1. **Human stop and control.** Part III says safety comes from sensing, which is true and incomplete. One paragraph on physical stop and teleoperation override would close it. Currently flagged in the text itself, which is the honest way to leave it but not a permanent solution.
2. **Licence.** Citation is required but no licence is named, which leaves the credit section without legal support. Choose MIT, Apache 2.0 or BSD.
3. **Determinism versus the model.** Written from your description of the VLM as a sensor plus human confirmation. Confirm the wording, especially the claim that a model does not override a safety constraint.
4. **What a robot lets people believe.** Placeholder containing my proposal, not your position. Names, first person speech, manner.
5. **Voice and ownership.** Who speaks publicly for SAIM, and what happens to a student's work after they leave, given that nobody has left yet.
6. **Scope of "we".** The document speaks for the laboratory, which means it commits Abaza and everyone else. It needs their agreement before it goes anywhere public.

# Passages to confirm

Extrapolations written to keep the document coherent. Each follows from something you said, but none is something you said directly. Correct or delete.

- The **Summary** priority ordering and the reasoning for it. This is the single largest addition in this version and the one most worth arguing with, since it determines what gives way in a conflict.
- **Part I**, the reading of each word in the name, and the section on why a laboratory and not a company.
- **Part I**, cheap methods as an openness argument.
- **Part II**, principles rather than procedures.
- **Part II**, semantics before geometry, written from the SAS architecture rather than from your answers.
- **Part II**, the corridor test and the requirement that claims carry conditions.
- **Part III**, the opening paragraph about people who did not choose to be near a robot, and the stranger's question.
- **Part III**, the answer to the job displacement objection.
- **Part V**, the reasoning for why these are bright lines rather than judgments, and the last two items in the list.
- **Part VI**, documentation as part of the work.
- **This document**, version control and open changes.
