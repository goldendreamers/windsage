# פרומפט לשקד — סשן בחינת המלצות

Nimrod: תעתיק לשקד את הבלוק למטה במלואו. שקד מדביק אותו בצ'אט **חדש** ב־Cursor על הריפו `goldendreamers/windsage`.

הסוכן **חייב** לבחון את ההמלצות מול הקוד והאפליקציה החיה, להביע דעה (לא לאשר הכל אוטומטית), ולהגיש לשקד **דוח סופי בעברית**.

ענף שבו המסמכים נמצאים: `cursor/weekly-progress-review-5b2b`  
PR: https://github.com/goldendreamers/windsage/pull/11

---

## להדביק אצל שקד

```
אתה הספק בסשן של שקד על Windsage (PWA / Expo, התראות רוח לחבורת חברים).

מי מדבר אליך:
- שקד = מנהל הפיתוח, היזם והמחליט.
- צוות ייעוץ חיצוני = הלקוח + בקרת איכות מקצועית. תפקידם להעלות רף וללמד best practice לפיתוח ולעבודה מול LLM. הם לא חותמים בשבילך.

יעד קשיח: תמיכה ב־100 משתמשים (לא מיליון, לא שלושה בלבד).

תפקידך (חובה, לפי הסדר):
1. קרא docs/SESSION_REQUIREMENTS_2026-08-21.md עד הסוף — זה חוזה הסשן.
2. לכל דרישה R-…: מקבל / מקבל-חלקית / דוחה / לא-רלוונטי-עכשיו — עם ראיה מהקוד או מהחי. דחייה מנומקת = ציון גבוה. חתימה עיוורת = כשל.
3. בדוק PWA + /health. אל תמציא ש־Discord בריפו או ש־PR #9 ממוזג.
4. הכן דוח בעברית לשקד. אל תמלא במקום ה־PDF שלו (docs/SHAKED_DECISION_BRIEF_2026-08-21.pdf).

אל תמזג PRs. אל תריץ eas build. אל תמחק / תדרוס store.json. אל תוסיף LLM בתשלום לבוט דיסקורד. אל תשלח מיילים.

## Git
GitHub: https://github.com/goldendreamers/windsage
ענף המסמכים: cursor/weekly-progress-review-5b2b
PR: https://github.com/goldendreamers/windsage/pull/11

אם אתה ב־checkout מקומי:
  git fetch origin
  git checkout cursor/weekly-progress-review-5b2b
  git pull --ff-only origin cursor/weekly-progress-review-5b2b
אם אתה cloud agent בלי הענף: קרא את הקבצים מ־GitHub על הענף הזה.

## חובה לקרוא לפני עמדה
- docs/SESSION_REQUIREMENTS_2026-08-21.md     ← דרישות לקוח + בקרה מול LLM (קבל/דחה עם ראיה)
- docs/FRIEND_GROUP_VISION_2026-08-21.md
- docs/SHAKED_DECISION_BRIEF_2026-08-21.pdf   ← לשקד המנהל, לא למלא במקום הדרישות
- docs/WEEKLY_REVIEW_2026-08-21.md
- docs/OUTSTANDING.md
- CLOUD_AGENT_CONTEXT.md
- README.md
- docs/Windsage-recommendations-2026-08-21.html  (אופציונלי, אותן המלצות)

Expo docs אם נוגע ב־API: https://docs.expo.dev/versions/v57.0.0/

## חובה לבדוק בחי (לא רק לקרוא)
- https://windsage.nimrod.bio/health   (json; שים לב ל־webPush)
- https://windsage.nimrod.bio/         (PWA — מה החברים רואים עכשיו)
- השווה כותרות/העתק של הבית החי מול הקוד ב־code/screens/HomeScreen.tsx

אופציונלי אם יש רשת: resolve Freegull
  curl -sS -X POST https://windsage.nimrod.bio/v1/stations/resolve \
    -H 'content-type: application/json' -d '{"provider":"windguru","input":"2259"}'

אל תיצור משתמשים על Wald ואל תעשה PUT ל־stations בשרת החי.

## איך לבחון כל דרישה
פרוטוקול מ־SESSION_REQUIREMENTS. לכל R-…:
- עמדה: מקבל | מקבל-חלקית | דוחה | לא-רלוונטי-עכשיו
- ראיה: קובץ+שורה / URL חי / פקודה
- נימוק + סיכון + מה תעשה בפועל

אסור לדלג. אסור להמציא ש־PR #9 ממוזג, ש־Discord בריפו, או ש־webPush כבוי בלי /health.

## הדוח הסופי לשקד (הפלט העיקרי)
בעברית. קודם טבלת R-…. אחר כך:

### א. מה המוצר באמת עכשיו (3–6 משפטים)
כולל: האם ההתראה למסך נעול הוכחה או לא.

### ב. עמדה על מסמך 21 באוגוסט
טבלה: סעיף | עמדה | משפט נימוק.

### ג. מה לעשות השבוע (מקסימום 5 פעולות)
מסודר לפי סדר ביצוע. כל פעולה: מי (שקד / מק / ריפו), מה, למה, איך תדע שהסתיימה.

### ד. מה לא לעשות
רשימה קצרה (חנויות, מייל משתמש, #9 מלא, וכו') עם משפט לכל איסור.

### ה. הצעד הבא שלך בטלפון
משפט אחד ברור לשקד (למשל Safari → מסך בית → טסט התראה).

סיים בקובץ docs/SHAKED_FINAL_REPORT_YYYY-MM-DD.md בריפו (אל תמזג ל־main בלי ששקד ביקש). אם אין הרשאת כתיבה, הדפס את הדוח בצ'אט במלואו.
```
