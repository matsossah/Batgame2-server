const locales = {
  fr: {
    YOUR_TURN: username => `À ton tour de jouer contre ${username} !`,
  },
  en: {
    YOUR_TURN: username => `Your turn to play against ${username}!`,
  },
};

export default function i18n(locale, id, ...args) {
  const firstPart = locale.split('-');
  const loc = {}.hasOwnProperty.call(locales, firstPart)
    ? locales[firstPart] : locales.en;
  return loc[id](...args);
}
