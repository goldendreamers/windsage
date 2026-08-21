# Windsage — לשקד (התחלה קבועה)

**ענף:** `main`  
**ריפו:** https://github.com/goldendreamers/windsage  

כל סשן Cursor אצל שקד מתחיל **כאן**. הנתיבים האלה לא משתנים עם תאריך. אחרי `git checkout main && git pull` הם על הדיסק.

## צעד 1 — דוח מחליט

Cursor **לא מציג PDF** (כרטיסייה ריקה). פתח את המרקדאון:

- [`docs/shaked/decision-brief.md`](shaked/decision-brief.md) ← **זה המסמך להציג לשקד קודם**
- PDF (Preview / דיסקורד, לא Cursor): [`docs/shaked/decision-brief.pdf`](shaked/decision-brief.pdf)
- HTML (Safari): [`docs/shaked/decision-brief.html`](shaked/decision-brief.html)

## שאר הגשר

| מסמך | נתיב קבוע |
| --- | --- |
| דרישות לסשן (לקוח + בקרה מול LLM) | [`docs/shaked/session-requirements.md`](shaked/session-requirements.md) |
| עקרונות לגזירת אפיונים | [`docs/shaked/vision.md`](shaked/vision.md) |
| פרומפט אפיון | [`docs/shaked/spec-prompt.md`](shaked/spec-prompt.md) |

אפליקציה חיה: https://windsage.nimrod.bio/  
בריאות: https://windsage.nimrod.bio/health

## פרומפט קצר לסשן חדש (הדבק אחרי pull של main)

```
קרא קודם docs/SHAKED.md ואז פתח לשקד את docs/shaked/decision-brief.md
(לא PDF — Cursor מציג PDF ריק). אחרי שהוא קרא: אפיון מול docs/shaked/session-requirements.md
ו-docs/shaked/vision.md. אל תכתוב קוד. אל תמזג PR #9. אל תריץ eas. אל תדרוס store.json.
אנחנו הלקוח + בקרה מול LLM. שקד המחליט. אתה הספק. יעד: 100 משתמשים.
```
