// Original chapter illustrations. Replace a scene's SVG with licensed art and retain its description.
const scenes = [
  {
    description: "曙光映照海上船隊，遠方是大員沙岸與城塞。",
    art: `
      <rect width="640" height="160" fill="#a79d7a"/>
      <circle cx="491" cy="44" r="30" fill="#eed49c"/>
      <path fill="#616b56" d="M0 95 53 67 96 80 151 69 210 102H0Z"/>
      <path fill="#455e52" d="M374 102 423 90 461 94 518 84 565 87 640 75v38Z"/>
      <path fill="#2e4742" d="M488 92V72h12v5h13V60h22v6h14v13h14v-5h12v18Z"/>
      <path fill="#365f62" d="M0 104Q171 94 342 107T640 99V160H0Z"/>
      <path fill="#e2c48e" opacity=".44" d="m426 108 133-1-43 7-90 2 119 3-30 6-115-1Z"/>
      <path fill="#dac595" d="M170 21q-31 26-46 60l42-6Zm9 14 35 43-36-4Zm-20 44q-30 13-53 26l57-7Z"/>
      <path fill="#9f583f" d="m175 22 27 8-27 5Z"/>
      <path fill="#233d3b" d="m101 105 70-7 65 1-22 19-84 1Z"/>
      <path fill="#c4b687" d="m291 63-26 32 25-3Zm7 6 18 24-18-1Zm39 9-17 20 16-2Z"/>
      <path fill="#2c4440" d="m256 98 70-3-12 10-46 1Zm62 4 38-3-7 8h-23Z"/>
      <path fill="none" stroke="#c7ceac" opacity=".55" d="M39 135q66-8 124-4m29-5 65-6m40 23q104-13 215-8m-15 12 86-8"/>
    `,
  },
  {
    description: "昏暗碼頭的商船準備裝載軍需，金色燈火外有巡船守著航道。",
    art: `
      <rect width="640" height="160" fill="#294b49"/>
      <path fill="#3d5f57" d="M0 61 72 48 165 62 235 51 314 71 468 60 640 71V160H0Z"/>
      <path fill="#2b5554" d="M0 82q150-17 302 1t338-2v79H0Z"/>
      <path fill="#263e3b" d="m437 78 51-5 54 1-18 9-70 1Zm103 11 61-2-13 8-39 2Z"/>
      <path fill="#7f9278" d="m491 45-23 28 24-1Zm70 18-12 23 13-2Z"/>
      <path fill="#182f2d" d="M0 0h236L147 42H0Zm57 34h12v126H57Zm-52 80 250-17 75 63H0Z"/>
      <path fill="#584935" d="m0 132 260-25 77 53H0Z"/>
      <path stroke="#a78d5f" opacity=".54" d="m10 145 274-25m-188 35 202-25m-67 28 81-16"/>
      <ellipse cx="256" cy="87" rx="65" ry="36" fill="#d6a55f" opacity=".12"/>
      <path fill="#b38953" d="M179 108V78l45-7 24 10v27l-39 11Zm79 7V92l38-5 26 10v24l-37 9Z"/>
      <path fill="#6b4d34" d="m179 78 30 10 39-7v27l-39 11V88Zm79 14 27 11 37-6v24l-37 9v-27Z"/>
      <path stroke="#e8c688" fill="none" d="m188 80 33 31m-22-35 33 31m35-12 30 29m-19-33 29 31"/>
      <path fill="#172e2c" d="m302 91 48-12 76 8-22 19-56 7Z"/>
      <path fill="#a98759" d="m346 37-18 43 50 4-20-43Z"/>
      <path stroke="#bc9b66" d="M254 27v29m93-29 7 56"/>
      <rect x="247" y="55" width="14" height="16" rx="2" fill="#edbd79"/>
    `,
  },
  {
    description: "閩南岸上烽煙升起，海上戰艦揚起朱色軍旗。",
    art: `
      <rect width="640" height="160" fill="#bdb08b"/>
      <path fill="#786c58" opacity=".52" d="M418 59q-39-23-23-39 14-12 50-9-24 10-12 17 24 11 12 31Zm102 2q-25-22-9-34-34-7-22-22 19 9 49 5 26 10 8 32-9 9-8 19Z"/>
      <path fill="#7b8268" d="M0 104 55 87 133 97 215 74 274 84 327 57 376 64 415 52 467 65 519 59 567 71 640 62V160H0Z"/>
      <path fill="#514e42" d="M378 77V66h16V55h24v9h33v10h31V62h21v12h54v13H374Z"/>
      <path fill="#526a60" d="M0 100q142-17 313 2t327-11v69H0Z"/>
      <path fill="#273e38" d="m100 129 78-12 133 1-22 20-145 5Zm202-24 89-5-12 13-65 1Zm-254 5 60-5-10 11H61Z"/>
      <path fill="#d9c69a" d="M164 60q-22 22-34 55l34-5Zm38-9q41 15 65 59l-62-1Zm132 19-20 29 26-1Zm-253 6-16 30 23-2Z"/>
      <path fill="#a24e3c" d="M167 46q-18-9-33 2l34 7Zm35-18q34-11 60 3-29 1-60 14Zm144 32q20-7 34 0l-34 10Zm-261 4-22-2 22 11Z"/>
      <path stroke="#3f4f41" stroke-width="2" d="M169 46v71m33-89 3 85m141-53 1 43m-262-39 4 44"/>
      <path fill="none" stroke="#c0be94" opacity=".57" d="M8 146q57-8 97-6m74 12 108-9m46-20 88-5m33 24q79-17 155-12"/>
    `,
  },
  {
    description: "烏雲與斜雨壓住海面，兩側艦影隔著翻湧的風浪對峙。",
    art: `
      <rect width="640" height="160" fill="#465757"/>
      <path fill="#263e44" d="M0 0h640v41q-66 15-138-5-79-23-123-4-76 24-139 10-79-20-133 5L0 54Z"/>
      <path fill="#728482" opacity=".65" d="M0 67q69-24 137-27 58 0 130 11 70 13 125-5 65-15 130 2L640 59v16q-89-23-176-12-55 15-119 10-126-20-216-15L0 78Z"/>
      <path fill="#314d56" d="M0 96q84-18 159-3t173-3 161-1 147-8v79H0Z"/>
      <path fill="#172e36" d="m32 87 71 9 42-2-19 13-69-3Zm401 11 122-15 46-1-27 23-91 7Z"/>
      <path fill="#8b9b91" d="m82 40 43 49-43 3Zm435-9-47 52 47-6Zm9 11 44 34-45 1Z"/>
      <path fill="#975d4a" d="m81 38 27 5-26 5Zm439-11 39-7-38 18Z"/>
      <path stroke="#c6d1bc" opacity=".4" d="m42 56-18 29m169-43-20 32m56-31-33 51m110-51-28 43m53-39-22 39m117-55-32 52m223-42-22 36"/>
      <path fill="#27434d" d="M0 125q70-53 160-3 69 37 143-4 72-45 149-7 82 48 188-20v69H0Z"/>
      <path fill="none" stroke="#a2b4a7" stroke-width="2" opacity=".76" d="M0 126q70-53 160-3 69 37 143-4 72-45 149-7 82 48 188-20M0 150q64-31 131-7m166 13q78-42 143-22m71 18q62 0 129-27"/>
    `,
  },
];

export function chapterCover(page) {
  const {description, art} = scenes[page];
  return `<svg class="chapter-cover" viewBox="0 0 640 160" role="img" aria-label="${description}">${art}</svg>`;
}
