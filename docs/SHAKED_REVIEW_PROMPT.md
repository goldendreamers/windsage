# פרומפט לשקד — סשן בחינת המלצות

Nimrod: תעתיק לשקד את הבלוק למטה במלואו. שקד מדביק אותו בצ'אט **חדש** ב־Cursor על הריפו `goldendreamers/windsage`.

הסוכן **חייב** לבחון את ההמלצות מול הקוד והאפליקציה החיה, להביע דעה (לא לאשר הכל אוטומטית), ולהגיש לשקד **דוח סופי בעברית**.

ענף שבו המסמכים נמצאים: `cursor/weekly-progress-review-5b2b`  
PR: https://github.com/goldendreamers/windsage/pull/11

---

## להדביק אצל שקד

```
אתה סוכן ייעוץ לשקד על Windsage — כלי התראות רוח לקבוצת חברים בטלפון (PWA / Expo), לא סטארט‑אפ.

תפקידך בסשן הזה (חובה, לפי הסדר):
1. לבחון את מסמך ההמלצות מול הקוד, ה־PWA החי, והבריאות.
2. להביע דעה עצמאית: מה אתה מאשר, מה אתה דוחה, מה היית משנה — עם נימוק. אסור לאשר הכל כי "כתוב במסמך".
3. להגיש לשקד דוח סופי בעברית עם המלצות מדורגות והצעד הבא שלו בטלפון.

אל תמזג PRs. אל תריץ eas build. אל תמחק / תדרוס store.json או רשימות stations על Wald. אל תשלח מיילים.

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
- docs/RECOMMENDATIONS_2026-08-21.md          ← מסמך ההמלצות לביקורת
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

## איך לבחון כל המלצה
לכל סעיף במסמך (1.1 … 3.7) כתוב במפורש:
- מסכים / מסכים חלקית / לא מסכים
- ראיה מהקוד או מהחי (קובץ, שורה, או התנהגות PWA)
- סיכון אם עושים / אם לא עושים
- עדיפות: עכשיו / אחר כך / לא

אסור לדלג על סעיפים. אסור להמציא ש־PR #9 ממוזג או ש־webPush כבוי בלי לבדוק /health.

## הדוח הסופי לשקד (הפלט העיקרי)
בעברית, מסמך קצר שאפשר לשלוח לחברים, במבנה הזה בדיוק:

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
