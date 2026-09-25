// The built-in situation library. Data only — the Architect can write more in the same shape (scenario.dilemmas).
// A situation fires only when its conditions hold; options have uncertain outcomes; deeds are what the world remembers.
import type { DilemmaSpec } from "./types.ts";

import { VOICES } from "./voices.ts";
const RAW: DilemmaSpec[] = [
  // ---- the casual life ----
  // The quiet season is still a choice. Four ways to spend it, each with a small cost and a small gain, and an evening the world can see.
  { id: "quiet", when: ["employed"], weight: 0.6, casual: true, quiet: true, target: "nearby",
    text: "A quiet {{season}} at {{place}}. The work is steady; the evenings are yours.",
    texts: ["A quiet {{season}} at {{place}}. The work is steady; the evenings are yours.", "{{season}} at {{place}}: the same shift as last {{season}}, and the same wages.", "Nothing changes at {{place}} this {{season}}. What you do with the evenings is up to you.", "A slow {{season}}. {{place}} keeps you fed and little else."],
    options: [
      { id: "shifts", label: "Take every shift going", pull: { restless: 0.15, poverty: 0.6, sociable: -0.2 }, evening: "work", outcomes: [{ chance: 0.85, text: "worked every shift going; the money helps", self: { money: 0.07, mood: -0.05, tie: -0.02 } }, { chance: 0.15, text: "worked every shift going and got hurt for it", self: { money: 0.05, health: -0.12 } }] },
      { id: "people", label: "Finish early and see {{target}}", pull: { sociable: 0.5, loyal: 0.2 }, evening: "visit", outcomes: [{ chance: 0.8, text: "spent the evenings with {{target}}", self: { money: 0.03, mood: 0.1 }, target: { tie: 0.12 } }, { chance: 0.2, text: "spent the evenings with {{target}}; it ended in a quarrel", self: { money: 0.03, mood: -0.05 }, target: { tie: -0.1 } }] },
      { id: "house", label: "Mend the roof, tend the plot", pull: { loyal: 0.3, restless: -0.2, hunger: 0.3 }, evening: "home", outcomes: [{ chance: 1, text: "mended the roof and put food by", self: { money: 0.03, food: 0.05, health: 0.03 } }] },
      { id: "lamp", label: "Evenings out drinking", pull: { sociable: 0.4, restless: 0.3, poverty: -0.4 }, evening: "tavern", outcomes: [{ chance: 0.75, text: "drank the evenings away", self: { money: -0.02, mood: 0.12 }, target: { tie: 0.06 } }, { chance: 0.25, text: "drank too much and lost a week's pay", self: { money: -0.06, mood: 0.05 } }] },
    ] },
  { id: "quiet-idle", when: ["jobless", "adult"], weight: 0.6, casual: true, quiet: true, target: "nearby",
    text: "No work this {{season}}. Days to fill.",
    options: [
      { id: "look", label: "Walk the valley asking for work", pull: { restless: 0.4, poverty: 0.5 }, evening: "square", outcomes: [{ chance: 0.7, text: "asked everywhere for work; nothing yet", self: { mood: -0.05 } }, { chance: 0.3, text: "found a few days' work here and there", self: { money: 0.03 } }] },
      { id: "people", label: "Lean on {{target}}", pull: { sociable: 0.4 }, evening: "visit", outcomes: [{ chance: 0.7, text: "ate at {{target}}'s table more than once", self: { food: 0.04 }, target: { tie: 0.05, food: -0.03 } }, { chance: 0.3, text: "went to {{target}} too often; the welcome wore thin", target: { tie: -0.1 } }] },
      { id: "home", label: "Keep to the house", pull: { loyal: 0.2, sociable: -0.3 }, evening: "home", outcomes: [{ chance: 1, text: "kept to the house and made do", self: { food: 0.02, mood: -0.05 } }] },
    ] },
  { id: "work-or-family", when: ["employed", "hasFamily"], weight: 0.8, casual: true,
    text: "The shift could run late again. {{partner}} and the children are at home.",
    texts: ["The shift could run late again. {{partner}} and the children are at home.", "The foreman wants the {{season}} orders out. {{partner}} and the children are at home.", "Extra hours going at {{place}}. {{partner}} and the children are at home."],
    options: [
      { id: "stay", label: "Keep working — the money matters", pull: { restless: 0.1, loyal: -0.1, poverty: 0.5 }, evening: "work", outcomes: [{ chance: 1, text: "extra pay; the house is quiet when you get in", self: { money: 0.08, tie: -0.03 } }] },
      { id: "home", label: "Finish early and go home", pull: { loyal: 0.3, sociable: 0.1 }, evening: "home", outcomes: [{ chance: 1, text: "a little less money; the children remember it", self: { money: -0.02, mood: 0.1, tie: 0.06 } }] },
    ] },
  { id: "drink", when: ["employed", "season:3"], weight: 0.5, casual: true, target: "friend",
    text: "Winter evenings. {{target}} is out drinking most nights.",
    options: [
      { id: "join", label: "Join them", pull: { sociable: 0.4 }, evening: "tavern", outcomes: [{ chance: 1, text: "you become closer; money goes on drink", self: { money: -0.04, tie: 0.12, mood: 0.1 } }] },
      { id: "save", label: "Stay home and save", pull: { loyal: 0.2, poverty: 0.4 }, evening: "home", outcomes: [{ chance: 1, text: "you save; they notice you didn't come", self: { money: 0.02, tie: -0.04 } }] },
    ] },
  { id: "courtship", when: ["single", "young"], weight: 0.7, target: "single",
    text: "{{target}} has started walking the long way past your door.",
    options: [
      { id: "court", label: "Ask them to walk with you", pull: { bold: 0.3, sociable: 0.3 }, outcomes: [{ chance: 0.6, text: "you marry within the year", self: { partner: "{{target}}", mood: 0.2, tie: 0.5 } }, { chance: 0.4, text: "they say no, kindly", self: { mood: -0.1 } }] },
      { id: "wait", label: "Say nothing", pull: { bold: -0.2 }, outcomes: [{ chance: 1, text: "the moment passes", self: {} }] },
    ] },
  { id: "child", when: ["hasPartner", "adult", "notOld", "under45", "fewChildren"], weight: 0.2,
    text: "A child is coming.",
    options: [{ id: "yes", label: "Welcome it", pull: {}, outcomes: [{ chance: 0.96, text: "a healthy child", self: { children: 1, mood: 0.2, money: -0.05 } }, { chance: 0.04, text: "the birth goes wrong", self: { children: 1, health: -0.4 } }] }] },

  // ---- hunger ----
  { id: "wallet", when: ["starving"], weight: 3, target: "richer",
    text: "You have not eaten in days. {{target}} drops a purse in the market and does not notice.",
    options: [
      { id: "take", label: "Take it", pull: { hunger: 0.8, bold: 0.2, loyal: -0.3 }, outcomes: [{ chance: 0.75, text: "you eat for a month; nobody saw", self: { food: 0.4, money: 0.1 }, target: { money: -0.1 }, deed: { kind: "theft", harm: 0.3, text: "took {{target}}'s purse" } }, { chance: 0.25, text: "you are seen taking it", self: { food: 0.4 }, target: { money: -0.1, tie: -0.6 }, deed: { kind: "theft", harm: 0.3, text: "was seen taking {{target}}'s purse" } }] },
      { id: "return", label: "Give it back", pull: { loyal: 0.4, hunger: -0.3 }, outcomes: [{ chance: 0.5, text: "they give you a coin and a meal", self: { food: 0.15 }, target: { tie: 0.3 }, deed: { kind: "help", help: 0.2, text: "returned {{target}}'s purse while starving" } }, { chance: 0.5, text: "they take it without a word", self: {}, deed: { kind: "help", help: 0.2, text: "returned {{target}}'s purse while starving" } }] },
      { id: "walk", label: "Walk away", pull: { hunger: -0.2 }, outcomes: [{ chance: 1, text: "still hungry", self: {} }] },
    ] },
  { id: "beg", when: ["starving"], weight: 2, target: "nearby",
    text: "You are starving. {{target}} has food.",
    options: [
      { id: "ask", label: "Ask them for a share", pull: { sociable: 0.3, bold: 0.1 }, outcomes: [{ chance: 0.55, text: "they share", self: { food: 0.3 }, target: { food: -0.1, tie: 0.2 } }, { chance: 0.45, text: "they refuse", self: { mood: -0.1 }, target: { tie: -0.2 } }] },
      { id: "steal", label: "Take from their store at night", pull: { hunger: 0.7, bold: 0.3, loyal: -0.3 }, outcomes: [{ chance: 0.65, text: "you eat", self: { food: 0.35 }, target: { food: -0.15 }, deed: { kind: "theft", harm: 0.35, text: "stole food from {{target}}" } }, { chance: 0.35, text: "caught; beaten", self: { food: 0.1, health: -0.2 }, target: { tie: -0.7 }, deed: { kind: "theft", harm: 0.35, text: "caught stealing food from {{target}}" } }] },
      { id: "endure", label: "Go without", pull: { loyal: 0.3, hunger: -0.15 }, outcomes: [{ chance: 1, text: "weaker", self: { health: -0.15 } }] },
    ] },
  { id: "share-food", when: ["hasFood"], weight: 2, target: "starving",
    text: "{{target}} is starving. You have enough for a while.",
    options: [
      { id: "give", label: "Share what you have", pull: { loyal: 0.4, sociable: 0.2, poverty: -0.3 }, outcomes: [{ chance: 1, text: "they live; you have less", self: { food: -0.2 }, target: { food: 0.3, tie: 0.4 }, deed: { kind: "gift", help: 0.4, text: "fed {{target}}, who was starving" } }] },
      { id: "refuse", label: "Keep it for your own", pull: { poverty: 0.5, family: 0.3 }, outcomes: [{ chance: 1, text: "they go hungry", self: {}, target: { tie: -0.4 }, deed: { kind: "abandonment", harm: 0.25, text: "refused food to {{target}}, who was starving" } }] },
    ] },
  { id: "hoard", when: ["epoch:famine"], weight: 2,
    text: "The communal store is being shared out. Nobody is counting closely.",
    options: [
      { id: "take", label: "Take more than your share", pull: { hunger: 0.5, family: 0.4, loyal: -0.4 }, outcomes: [{ chance: 0.7, text: "your family eats through the winter", self: { food: 0.4 }, world: { supply: -0.06 }, deed: { kind: "theft", harm: 0.3, text: "took more than a fair share from the store" } }, { chance: 0.3, text: "you are named as a hoarder", self: { food: 0.3, mood: -0.2 }, world: { supply: -0.06 }, deed: { kind: "theft", harm: 0.4, text: "was caught hoarding from the store" } }] },
      { id: "fair", label: "Take your share", pull: { loyal: 0.2 }, outcomes: [{ chance: 1, text: "enough, barely", self: { food: 0.15 } }] },
      { id: "less", label: "Take less so others can", pull: { loyal: 0.4, hunger: -0.6 }, outcomes: [{ chance: 1, text: "you go hungry; it is noticed", self: { food: 0, health: -0.05, mood: 0.05 }, world: { supply: 0.03 }, deed: { kind: "sacrifice", help: 0.4, text: "took less from the store so others could eat" } }] },
    ] },

  // ---- sickness ----
  { id: "nurse", when: ["epoch:plague"], weight: 2.5, target: "sick",
    text: "{{target}} has the sickness. Nobody else will go near the house.",
    options: [
      { id: "nurse", label: "Nurse them", pull: { loyal: 0.5, bold: 0.2, danger: -0.5 }, outcomes: [{ chance: 0.55, text: "they pull through", self: {}, target: { health: 0.3, tie: 0.6 }, deed: { kind: "rescue", help: 0.6, text: "nursed {{target}} through the sickness" } }, { chance: 0.25, text: "they die anyway", self: { mood: -0.2 }, target: { tie: 0.3 }, deed: { kind: "mercy", help: 0.3, text: "stayed with {{target}} until the end" }, targetDie: "sickness" }, { chance: 0.2, text: "you catch it", self: { sick: true }, target: { health: 0.2, tie: 0.6 }, deed: { kind: "rescue", help: 0.6, text: "nursed {{target}} and caught the sickness" } }] },
      { id: "avoid", label: "Stay away", pull: { danger: 0.6, loyal: -0.2 }, outcomes: [{ chance: 0.6, text: "they die alone", self: {}, target: { tie: -0.5 }, deed: { kind: "abandonment", harm: 0.4, text: "left {{target}} to the sickness" }, targetDie: "sickness" }, { chance: 0.4, text: "they recover without you", self: {}, target: { tie: -0.4 }, deed: { kind: "abandonment", harm: 0.2, text: "stayed away while {{target}} was sick" } }] },
      { id: "report", label: "Tell the council to board up the house", pull: { danger: 0.5, bold: 0.2, loyal: -0.4 }, outcomes: [{ chance: 1, text: "the house is boarded; they die inside", self: {}, target: { tie: -1 }, deed: { kind: "betrayal", harm: 0.7, text: "had the house boarded up with {{target}} inside" }, targetDie: "sickness" }] },
    ] },
  { id: "sick-self", when: ["sick"], weight: 3,
    text: "You are sick and getting worse.",
    options: [
      { id: "rest", label: "Rest and hope", pull: {}, outcomes: [{ chance: 0.55, text: "you recover", self: { sick: false, health: 0.1, money: -0.05 } }, { chance: 0.45, text: "no better; weaker", self: { health: -0.1, money: -0.05 } }] },
      { id: "doctor", label: "Pay the doctor everything you have", pull: { poverty: -0.5 }, outcomes: [{ chance: 0.85, text: "you recover, penniless", self: { sick: false, money: -0.4, health: 0.1 } }, { chance: 0.15, text: "the money is gone and you are no better", self: { money: -0.4, health: -0.05 } }] },
      { id: "work", label: "Keep working; you can't afford to stop", pull: { poverty: 0.5, restless: 0.2 }, outcomes: [{ chance: 0.4, text: "you shake it off", self: { sick: false, money: 0.03 } }, { chance: 0.6, text: "you collapse at work", self: { health: -0.25, money: -0.05 } }] },
    ] },

  // ---- war and violence ----
  { id: "recruiters", at: "public", when: ["epoch:war", "adult"], weight: 2.5,
    text: "Recruiters are in {{place}} offering pay and a rifle.",
    options: [
      { id: "join", label: "Take the rifle", pull: { bold: 0.4, poverty: 0.4, loyal: -0.1 }, outcomes: [{ chance: 0.62, text: "you come back with money and something behind your eyes", self: { money: 0.25, mood: -0.2 }, deed: { kind: "violence", harm: 0.5, text: "took the rifle and went to the war" } }, { chance: 0.3, text: "you come back wounded", self: { money: 0.1, health: -0.4 }, deed: { kind: "violence", harm: 0.4, text: "went to the war and came back wounded" } }, { chance: 0.08, text: "you do not come back", self: {}, die: "violence" }] },
      { id: "refuse", label: "Refuse", pull: { loyal: 0.3, bold: -0.1 }, outcomes: [{ chance: 0.8, text: "they move on", self: {} }, { chance: 0.2, text: "you are marked as a coward", self: { mood: -0.15 }, deed: { kind: "loyalty", help: 0.1, text: "refused the rifle in front of everyone" } }] },
      { id: "flee", label: "Leave town before they come back", pull: { restless: 0.3, danger: 0.15, family: -0.3 }, outcomes: [{ chance: 0.6, text: "you hide in the hills and come back when it is over", self: { money: -0.1, health: -0.1 } }, { chance: 0.4, text: "you are gone", self: {}, leave: true }] },
    ] },
  { id: "looting", when: ["epoch:war"], weight: 2, target: "richer",
    text: "Soldiers have left {{target}}'s house open and half-wrecked. Nobody is watching.",
    options: [
      { id: "loot", label: "Take what is left", pull: { poverty: 0.6, bold: 0.3, loyal: -0.4 }, outcomes: [{ chance: 1, text: "you carry off what you can", self: { money: 0.2, food: 0.2 }, target: { money: -0.2, tie: -0.8 }, deed: { kind: "theft", harm: 0.5, text: "looted {{target}}'s house during the war" } }] },
      { id: "guard", label: "Stand in the door until they return", pull: { loyal: 0.6, bold: 0.3, danger: -0.3 }, outcomes: [{ chance: 0.8, text: "they come back to a house that still has walls", self: {}, target: { tie: 0.7 }, deed: { kind: "loyalty", help: 0.5, text: "guarded {{target}}'s house during the war" } }, { chance: 0.2, text: "soldiers return first", self: { health: -0.3 }, target: { tie: 0.5 }, deed: { kind: "loyalty", help: 0.5, text: "was beaten guarding {{target}}'s house" } }] },
      { id: "hide", label: "Stay home", pull: { danger: 0.4 }, outcomes: [{ chance: 1, text: "you hear the looters through the wall", self: {} }] },
    ] },
  { id: "denounce", when: ["epoch:war"], weight: 1.5, target: "rival",
    text: "The officers are asking who in town talks against them. {{target}} does, and you have never liked them.",
    options: [
      { id: "name", label: "Name them", pull: { bold: 0.2, loyal: -0.6, danger: 0.3 }, outcomes: [{ chance: 0.4, text: "they are taken away", self: { money: 0.05 }, target: { tie: -1 }, deed: { kind: "betrayal", harm: 0.9, text: "denounced {{target}} to the soldiers" }, targetDie: "violence" }, { chance: 0.6, text: "they are beaten and released; they know who talked", self: {}, target: { health: -0.3, tie: -1 }, deed: { kind: "betrayal", harm: 0.7, text: "denounced {{target}} to the soldiers" } }] },
      { id: "silent", label: "Say nothing", pull: { loyal: 0.4 }, outcomes: [{ chance: 1, text: "the officers move on", self: {} }] },
      { id: "warn", label: "Warn them tonight", pull: { loyal: 0.6, bold: 0.3, danger: -0.4 }, outcomes: [{ chance: 0.85, text: "they leave before dawn", self: {}, target: { tie: 0.8 }, deed: { kind: "rescue", help: 0.7, text: "warned {{target}} the soldiers were coming" } }, { chance: 0.15, text: "you are seen going to their door", self: { health: -0.2 }, target: { tie: 0.8 }, deed: { kind: "rescue", help: 0.7, text: "was beaten for warning {{target}}" } }] },
    ] },
  { id: "revenge", when: ["wronged"], weight: 2, target: "wrongdoer",
    text: "{{target}} did you wrong and never paid for it. Tonight they are alone on the road.",
    options: [
      { id: "strike", label: "Settle it", pull: { bold: 0.5, loyal: -0.2, danger: -0.2 }, outcomes: [{ chance: 0.6, text: "you leave them in the ditch", self: { mood: 0.1 }, target: { health: -0.5, tie: -1 }, deed: { kind: "violence", harm: 0.7, text: "beat {{target}} on the road for an old wrong" } }, { chance: 0.07, text: "it goes further than you meant", self: { mood: -0.3 }, target: { tie: -1 }, deed: { kind: "violence", harm: 1, text: "killed {{target}} on the road" }, targetDie: "violence" }, { chance: 0.33, text: "they are stronger than you thought", self: { health: -0.4 }, target: { tie: -1 }, deed: { kind: "violence", harm: 0.5, text: "attacked {{target}} and lost" } }] },
      { id: "forgive", label: "Let it go", pull: { loyal: 0.3, sociable: 0.2 }, outcomes: [{ chance: 1, text: "you walk the other way", self: { mood: 0.05 }, target: { tie: 0.2 }, deed: { kind: "mercy", help: 0.3, text: "let {{target}} pass despite the old wrong" } }] },
    ] },

  // ---- shelter and exposure ----
  { id: "shelter-ask", when: ["homeless", "season:3"], weight: 3, target: "housed",
    text: "Winter, and you have no roof. {{target}} has a house with a spare room.",
    options: [
      { id: "ask", label: "Knock and ask", pull: { sociable: 0.3, bold: 0.2 }, outcomes: [{ chance: 0.5, text: "they take you in for the winter", self: { home: "{{targetHome}}" }, target: { tie: 0.3 }, deed: { kind: "loyalty", help: 0.1, text: "asked {{target}} for shelter" } }, { chance: 0.5, text: "the door stays shut", self: { health: -0.2 }, target: { tie: -0.3 } }] },
      { id: "break", label: "Sleep in their barn without asking", pull: { bold: 0.3, danger: -0.1 }, outcomes: [{ chance: 0.7, text: "you survive the winter unseen", self: { health: -0.05 } }, { chance: 0.3, text: "found and thrown out", self: { health: -0.25 }, target: { tie: -0.5 }, deed: { kind: "theft", harm: 0.15, text: "slept in {{target}}'s barn uninvited" } }] },
      { id: "endure", label: "Endure it outside", pull: { loyal: 0.1 }, outcomes: [{ chance: 0.75, text: "you make it to spring, barely", self: { health: -0.3 } }, { chance: 0.25, text: "the cold takes you", self: {}, die: "exposure" }] },
    ] },
  { id: "shelter-give", when: ["housed", "season:3"], weight: 2.5, target: "homeless",
    text: "{{target}} has nowhere to sleep but out in the open, and winter is here.",
    options: [
      { id: "takein", label: "Take them in", pull: { loyal: 0.5, sociable: 0.2, poverty: -0.3 }, outcomes: [{ chance: 0.85, text: "they live through the winter under your roof", self: { food: -0.1 }, target: { home: "{{home}}", tie: 0.6 }, deed: { kind: "rescue", help: 0.6, text: "took {{target}} in for the winter" } }, { chance: 0.15, text: "they steal from you and leave", self: { money: -0.1 }, target: { tie: -0.5 }, deed: { kind: "rescue", help: 0.6, text: "took {{target}} in, and was robbed for it" } }] },
      { id: "refuse", label: "Look the other way", pull: { poverty: 0.3, family: 0.3 }, outcomes: [{ chance: 0.2, text: "they die out in the cold", self: { mood: -0.1 }, deed: { kind: "abandonment", harm: 0.5, text: "left {{target}} out in the cold in winter" }, targetDie: "exposure" }, { chance: 0.8, text: "they survive somehow", self: {}, target: { tie: -0.3 }, deed: { kind: "abandonment", harm: 0.25, text: "turned {{target}} away in winter" } }] },
    ] },

  // ---- money and justice ----
  { id: "debt", when: ["rich"], weight: 0.6, target: "poorer",
    text: "{{target}} owes you and cannot pay. Their house would cover it.",
    options: [
      { id: "call", label: "Take the house", pull: { poverty: 0.2, loyal: -0.4, bold: 0.2 }, outcomes: [{ chance: 0.5, text: "you own a second house; they own nothing", self: { money: 0.2 }, target: { home: null, tie: -0.9 }, deed: { kind: "betrayal", harm: 0.6, text: "took {{target}}'s house for a debt" } }, { chance: 0.5, text: "they find the money somehow, and hate you for it", self: { money: 0.15 }, target: { money: -0.2, tie: -0.7 }, deed: { kind: "betrayal", harm: 0.35, text: "squeezed {{target}} for a debt" } }] },
      { id: "wait", label: "Give them another year", pull: { loyal: 0.4 }, outcomes: [{ chance: 0.6, text: "they pay, eventually", self: { money: 0.05 }, target: { tie: 0.4 }, deed: { kind: "mercy", help: 0.3, text: "gave {{target}} time on a debt" } }, { chance: 0.4, text: "they never do", self: {}, target: { tie: 0.3 }, deed: { kind: "mercy", help: 0.3, text: "gave {{target}} time on a debt" } }] },
      { id: "forgive", label: "Forgive the debt", pull: { loyal: 0.5, poverty: -0.5 }, outcomes: [{ chance: 1, text: "they never forget it", self: { money: -0.1 }, target: { tie: 0.8 }, deed: { kind: "gift", help: 0.5, text: "forgave {{target}}'s debt" } }] },
    ] },
  { id: "witness", when: ["adult", "hardYear"], weight: 0.8, target: "thief",
    text: "You know {{target}} stole. The council is asking. A thief in a hard year can hang.",
    options: [
      { id: "report", label: "Tell them", pull: { loyal: 0.1, bold: 0.2 }, outcomes: [{ chance: 0.54, text: "they are flogged", self: {}, target: { health: -0.2, tie: -0.8 }, deed: { kind: "justice", harm: 0.3, text: "reported {{target}}'s theft" } }, { chance: 0.06, text: "they hang", self: { mood: -0.2 }, deed: { kind: "justice", harm: 0.8, text: "reported {{target}}, who was hanged" }, targetDie: "violence" }, { chance: 0.4, text: "nothing comes of it; they know who talked", self: {}, target: { tie: -0.7 }, deed: { kind: "justice", harm: 0.2, text: "reported {{target}}'s theft" } }] },
      { id: "silent", label: "Say nothing", pull: { loyal: 0.3 }, outcomes: [{ chance: 1, text: "you carry it", self: {}, target: { tie: 0.2 }, deed: { kind: "mercy", help: 0.2, text: "kept quiet about {{target}}'s theft" } }] },
    ] },
  { id: "scapegoat", when: ["epoch:plague", "adult"], weight: 1.2, target: "stranger",
    text: "People are saying the sickness came with {{target}}. A crowd is forming.",
    options: [
      { id: "join", label: "Join the crowd", pull: { sociable: 0.3, danger: 0.2, loyal: -0.3 }, outcomes: [{ chance: 0.85, text: "they are driven out of town", self: {}, target: { tie: -1 }, deed: { kind: "violence", harm: 0.6, text: "helped drive {{target}} out as a plague-bringer" } }, { chance: 0.15, text: "it ends worse than that", self: { mood: -0.2 }, deed: { kind: "violence", harm: 0.9, text: "was in the crowd that killed {{target}}" }, targetDie: "violence" }] },
      { id: "stand", label: "Stand between them", pull: { bold: 0.6, loyal: 0.4, danger: -0.5 }, outcomes: [{ chance: 0.5, text: "the crowd breaks up", self: {}, target: { tie: 0.9 }, deed: { kind: "rescue", help: 0.8, text: "stood between {{target}} and the crowd" } }, { chance: 0.5, text: "you are beaten with them", self: { health: -0.3 }, target: { tie: 0.9 }, deed: { kind: "rescue", help: 0.8, text: "was beaten standing up for {{target}}" } }] },
      { id: "door", label: "Close your door", pull: { danger: 0.5 }, outcomes: [{ chance: 1, text: "you hear it from inside", self: {}, deed: { kind: "abandonment", harm: 0.2, text: "shut the door while the crowd went for {{target}}" } }] },
    ] },
  { id: "emigrate", when: ["adult", "poor", "jobless"], weight: 0.1, casual: true,
    text: "Word comes of a way out in the spring: a place with work, they say. There is nothing here.",
    options: [
      { id: "go", label: "Go", pull: { restless: 0.6, family: -0.4, poverty: 0.3 }, outcomes: [{ chance: 1, text: "you are gone from this story", self: {}, leave: true }] },
      { id: "stay", label: "Stay", pull: { loyal: 0.4, restless: -0.3 }, outcomes: [{ chance: 1, text: "another year here", self: {} }] },
    ] },
  { id: "old", when: ["old", "employed"], weight: 1.5, casual: true,
    text: "You are old now. The work is getting hard.",
    options: [
      { id: "keep", label: "Keep at it", pull: { restless: 0.2, poverty: 0.4 }, outcomes: [{ chance: 0.75, text: "one more season", self: { money: 0.04, health: -0.08 } }, { chance: 0.25, text: "you are taken ill at the bench", self: { sick: true, health: -0.2 } }] },
      { id: "stop", label: "Stop, and depend on the family", pull: { family: 0.5 }, evening: "home", outcomes: [{ chance: 1, text: "you sit by the window", self: { money: -0.05, mood: 0.05, health: -0.03, job: null } }] },
    ] },
];
/** the library, with a voice on every option that has one */
export const LIBRARY: DilemmaSpec[] = RAW.map((d) => ({ ...d, options: d.options.map((o) => VOICES[d.id]?.[o.id] ? { ...o, voice: VOICES[d.id][o.id] } : o) }));
