# Design review: Decks page

Webatrice PR review, 04.11.26, for [PR #2](https://github.com/SwitchOCE/Webatrice/pull/2). Questions from the review; answers from Matthew (designer), in his words. Answers marked **Question not understood** need a follow-up with him.

## 1. Contrast

**Question:** White text on three of the bands falls below the 4.5:1 minimum for readable small text: Commander 3.1:1, Pauper 3.8:1, Standard 4.1:1. These shades keep the same hues and pass: Commander `#1D844D`, Standard `#127F91`, Pauper `#B15E1B`. The bracket badge text also falls short (3.7–4.3:1): it uses the bracket colour, not the "light text" in the spec.

**Answer:** Yes those colour chagnes are good, I’ve already added them the PR#2

*Done in this PR: commit c21c0945 (bands 4.7:1, bracket badge text 6.5–10.2:1).*

## 2. "Local decks" label

**Question:** "Local decks" labels the decks stored on the server. Desktop Cockatrice calls this "Server deck storage", and so does the "Move to folder" dialog here. Keep "Local decks"?

**Answer:** Change title to “Private decks”

## 3. Colours by family

**Question:** The feedback asked for "different coloured bands for each format". The build uses 5 family colours plus grey, so Penny Dreadful and Gladiator look the same as "no format". Is grouping by family what you want?

> [!WARNING]
> **Question not understood.** Matthew's answer:
>
> I did not explicatly select colour for Penny dreadful and Gladiator. They are less common formats and I thought that we were running out of colours and leaving them grey would not matter. “Is grouping by family what you want?” I don’t know what that means

## 4. Card footer padding

**Question:** Its padding changed (8px → 2px above and below) although the PR says "unchanged". Keep it?

**Answer:** According to my designs the deck card footer has a padding of 8px. I don’t know why the padding would have change to 2px

## 5. Sort, view and refresh on their own row

**Question:** Sort, view and refresh move onto their own row below about 1530px wide, which adds 44px above the grid at 1440 and 1280. The design was approved at 1920 only.

**Answer:** Yes, there should still be enough space, if not then the filter inputs can wrap
