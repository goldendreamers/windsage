# דוח סשן אפיון — Windsage

**תאריך:** 21 באוגוסט 2026  
**מחליט:** שקד  
**ספק:** סוכן Cursor  
**לקוח / בקרה:** צוות ייעוץ מול LLM  
**חי:** https://windsage.nimrod.bio/  
**בריאות:** https://windsage.nimrod.bio/health  
**דוח מחליט:** https://github.com/goldendreamers/windsage/blob/main/docs/shaked/decision-brief.md  
**אינדקס:** [file:///Users/goldendreamers/windsage/docs/SHAKED.md](file:///Users/goldendreamers/windsage/docs/SHAKED.md)

לא נכתב קוד עד אחרי קריאת דוח המחליט. לא מוזג PR #9. לא רץ eas. לא נדרס `store.json`.

יעד: **100 משתמשים**. חבורה → הזמנה לדיסקורד. הטלפון = פעמון. בוט בלי טוקני LLM.

---

## החלטות ספק (ברירת מחדל עד ששקד משנה)

| שאלה | החלטת ספק | למה |
| --- | --- | --- |
| סף ברירת מחדל | **15 קשר / 20 דקות** | כבר חי ב-`METRIC_DEFAULTS`. 16 כמו KDI רק אם שקד כותב במפורש. |
| בוט | **בוט אחד:** `/ask` FAQ + `/ruach` `/laan` על `/v1`. בלי Groq/OpenAI. | FAQ לבד לא ממלא את החזון. LLM בתשלום = כשל מוצר. |
| באזז כיס | שקד חייב להרגיש רטט במסך נעול | בלי זה המועדון מדבר על אוויר. |

מייל `Windsage · ACTION NEEDED: באזז במסך נעול + שתי החלטות` נשלח ב-21.8.2026.

---

## עובדות חיות

`https://windsage.nimrod.bio/health` (נבדק בסשן): `webPush: true`, Google SSO דולק, Discord SSO דולק, הזמנה `https://discord.gg/uZSeqTcYq`. מקורות WG/NDBC/Open-Meteo/location/Synoptic `ready`.

`origin/main` (`e514b20`) הכיל מסמכי שקד בלבד. דיסקורד OAuth+Join וה-helper היו בדיפ המקומי / בחי, לא בגיט `main`.

---

## טבלת R-…

| ID | עמדה | ראיה | נימוק | סיכון | מה נעשה |
| --- | --- | --- | --- | --- | --- |
| R-100 | מקבל | `code/cloud/lib/store.mjs` תור + סירוב wipe; `mapPool(..., 4)` | JSON מחזיק 100 | Postgres בלי כאב = בזבוז | אין מיגרציית DB |
| R-CLUB | מקבל | health `discordInvite` | הצלחה = הזמנה | חנות לפני חבורה הורגת את המועדון | Join Discord מוסתר בלי הזמנה |
| R-NOCOMP | מקבל | חזון §2 | מקשרים החוצה | מסך תחליף-Windy | לא נבנה תחליף |
| R-HE | מקבל כדרישה | `notifyCopy` היה אנגלית | מועדון עברי | אנגלית מרחיקה | בית «לאן לצאת» + התראת החזקה בעברית |
| R-HOLD | מקבל | `evaluateAlert` שורות 176–179 | באזז אחרי החזקה | דקירה = רעש | סף נשאר 15/20 |
| R-SLEEP | מקבל | README + `unregisterBackgroundFetch` | הטלפון ישן | פול רקע הורג סוללה | לא הוחזר רקע |
| R-NAMES | מקבל-חלקית | `clubSpots.json` + קטלוג WG | שמות חבורה | ID למשתמש = נטישה | מילון פריגול/הרצליה/חיפה |
| R-PERSONAL | מקבל | `FollowedStation.rule` | לא שידור KDI | סף מועדון דורס אישי | אין שידור 16 לכולם |
| R-PUSH | מקבל-חלקית | health `webPush: true` | קוד מוכן, באזז לא הוכח | דשבורד בלי פעמון | טסט קיים; מחכים לשקד |
| R-DISCORD | מקבל | SSO+הזמנה חיים | מועדון קיים | להמציא שבוט חי | בוט מזג אוויר דרך `/v1`, בלי טוקן בגיט |
| R-BOT0 | מקבל | `/v1/club/wind` `/v1/club/glance` | 0 טוקני LLM | FAQ לבד ≠ רוח | `/ruach` `/laan` |
| R-BOT1 | מקבל | נמחק `llm.mjs` / Groq מה-config | אין API בתשלום | Groq שקט ב-env | נותק |
| R-ONEBRAIN | מקבל | בוט קורא `/v1` | אין store לבוט | מוח שני משקר | helper לא קורא `store.json` |
| R-JSON | מקבל | `store.json` | 100 זה מגהבייטים | SQLite עכשיו | אין החלפת מנוע |
| R-API | מקבל | Expo + `code/cloud` | גבול קיים | פיצול ריפו | הרחבת `/v1` בלבד |
| R-NOWIPE | מקבל | `saveStore` / `applyStationsPut` | 4 משתמשים חיים | rsync data | לא נגענו ב-store |
| R-PR9 | מקבל | PR #9 לא מוזג | ternary / 69 קבצים | שבירת Metro | לא מוזג |
| R-NOEAS | מקבל | — | כסף בלי באזז | ביקורת חנות | לא רץ eas |
| R-EXPO57 / R-SMALLPR / R-EVIDENCE / R-SECRETS / R-PATHS / R-BUILDER | מקבל | — | רף ספק | «סיימתי» בלי URL | דוח זה + `/health` |

---

## חזון 13–22 (קצר)

13 לאן לצאת — נבנה בבית (עברית) + `/laan`.  
14 שני פעמונים — Web Push קיים; webhook `DISCORD_HOLD_WEBHOOK_URL` (לא בגיט).  
15 כניסה/החזקה — סטטוסים מחזיק/עולה/מת.  
16 אני יוצא — לא ב-PWA בסשן הזה.  
17 תדריך שישי — לא עכשיו.  
18 `/ruach` `/laan` `/briut` — כן.  
19 מילון — `clubSpots.json`.  
20 כנרת — לא.  
21 קיט — לא.  
22 שעות שקטות — אחרי באזז מוכח.

---

## מה שקד עוד צריך בידיים

1. Safari → מסך בית → Send test phone alert → לנעול → **הרגשתי / לא הגיע**.  
2. אם רוצה 16/20 במקום 15/20 — לכתוב במפורש.  
3. אם יש webhook ל-`#עכשיו`: להדביק בצ׳אט (לא במייל) `https://discord.com/api/webhooks/…` להדבקה ב-`/data/windsage/oauth.env` כ-`DISCORD_HOLD_WEBHOOK_URL`.
