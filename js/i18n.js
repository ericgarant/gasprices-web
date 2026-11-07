// Language: French (default) and English. The choice is saved on the device (lp.lang); with no saved choice
// the phone's language list decides (first of fr / en wins, anything else falls back to French).
// Station data from the Régie (names, addresses, regions) is never translated.

const KEY = 'lp.lang';
export const LANGS = ['fr', 'en'];
const LOCALES = { fr: 'fr-CA', en: 'en-CA' };

function detect() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (LANGS.includes(s)) return s; } catch { /* no storage */ }
  const list = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'fr']);
  for (const l of list) {
    const p = String(l).toLowerCase().slice(0, 2);
    if (p === 'fr' || p === 'en') return p;
  }
  return 'fr';
}

export let lang = detect();
export const locale = () => LOCALES[lang];
document.documentElement.lang = lang;

const plural = (one, many) => (v) => (v.n === 1 ? one : many);

const DICT = {
  fr: {
    'meta.title': 'Le Plein · Prix de l’essence au Québec',
    'meta.desc': 'Trouvez l’essence la moins chère près de vous au Québec. Données : Régie de l’énergie du Québec.',
    'search.placeholder': 'Ville, adresse ou bannière', 'search.aria': 'Rechercher',
    'filters.aria': 'Filtres et réglages', 'filters.ariaActive': 'Filtres et réglages (actifs)',
    'fuel.group': 'Carburant', 'fuel.0': 'Régulier', 'fuel.1': 'Super', 'fuel.2': 'Diesel',
    'radar.aria': 'Radar des aubaines près de moi', 'heat.aria': 'Carte de chaleur des prix', 'locate.aria': 'Ma position',
    'view.map': 'Carte', 'view.list': 'Liste des stations', 'view.favs': 'Favoris',
    'heat.title': 'Prix relatifs à la région', 'heat.low': 'Bas', 'heat.mid': 'Moyen', 'heat.high': 'Élevé',
    'sort.group': 'Tri', 'sort.price': 'Prix', 'sort.dist': 'Distance',
    'credit': 'Données : Régie de l’énergie du Québec',
    'loading': 'Le plein de prix en cours…',
    'nav.label': 'Navigation', 'nav.map': 'Carte', 'nav.list': 'Liste', 'nav.favs': 'Favoris',
    'noscript': 'Le Plein a besoin de JavaScript pour afficher les prix.',
    'fresh.loading': 'Chargement…', 'fresh.offline': 'Hors ligne · prix {age}', 'fresh.stale': 'Prix {age}', 'fresh.refresh': 'Actualiser',
    'age.now': 'à l’instant', 'age.min': 'il y a {n} min', 'age.h': 'il y a {n} h', 'age.d': 'il y a {n} j',
    'toast.updated': 'Prix à jour',
    'toast.refreshFail': 'Impossible d’actualiser. Prix de la dernière mise à jour.',
    'toast.loadFail': 'Impossible de charger les prix. Vérifiez votre connexion.',
    'map.fail': 'La carte n’a pas pu se charger. La liste reste disponible.',
    'cluster.aria': '{n} stations, à partir de {p} cents', 'cluster.n': '{n} stations',
    'pin.title': '{name}, {p} cents',
    'best.none': 'Aucune station dans cette zone', 'best.noneHint': 'Déplacez la carte ou ajustez les filtres.',
    'best.title': 'Le moins cher ici', 'best.aria': 'Le moins cher dans cette zone : {name}, {p} cents. Ouvrir la fiche',
    'me.aria': 'Votre position',
    'loc.unavailable': 'La géolocalisation n’est pas disponible sur cet appareil.',
    'loc.denied': 'Position refusée. Autorisez-la dans les réglages du navigateur.',
    'loc.notfound': 'Position introuvable pour le moment.',
    'loc.searching': 'Recherche de votre position…',
    'list.nearTitle': 'Près de vous',
    'list.nearBody': 'Activez la position pour trier par distance. Sinon, voici les moins chers du Québec.',
    'list.enable': 'Activer',
    'list.emptyTitle': 'Aucune station trouvée', 'list.emptyRadius': 'Aucune dans {r} km avec ces filtres. ',
    'list.emptyHint': 'Essayez d’élargir la recherche ou de réinitialiser les filtres.', 'filters.btn': 'Filtres',
    'list.more': 'Afficher plus ({n})',
    'favs.title': 'Favoris', 'favs.emptyTitle': 'Aucun favori pour l’instant',
    'favs.emptyBody': 'Touchez le cœur dans la fiche d’une station pour la retrouver ici, avec son prix à jour.',
    'favs.missing': '{n} favori(s) absent(s) des données actuelles (station fermée ?).',
    'fuel.na': '{fuel} n/d', 'fav.label': 'Favori',
    'share.aria': 'Partager', 'fav.add': 'Ajouter aux favoris', 'fav.remove': 'Retirer des favoris', 'close': 'Fermer',
    'level.cheap': 'Bas prix', 'level.avg': 'Moyen', 'level.pricey': 'Élevé',
    'best.tag': 'Meilleur prix près de vous',
    'sign.head': 'Prix affichés', 'sign.unit': '¢ / litre',
    'avg.same': 'Dans la moyenne', 'avg.below': '{d}¢ sous la moyenne de la région', 'avg.above': '{d}¢ au-dessus de la moyenne de la région',
    'details.title': 'Détails de la station', 'details.brand': 'Bannière : ', 'details.operator': 'Exploitant : ', 'details.region': 'Région : ', 'details.addr': 'Adresse : ',
    'directions': 'Itinéraire', 'directions.opens': 'Ouvre {app} · Données : Régie de l’énergie du Québec',
    'app.apple': 'Apple Plans', 'app.google': 'Google Maps',
    'back.station': 'Retour à la station',
    'fav.added': 'Ajouté aux favoris', 'fav.removed': 'Retiré des favoris',
    'calc.title': 'Calculateur d’économies', 'calc.litres': 'Litres', 'calc.litresAria': 'Litres à mettre',
    'calc.same': 'Même prix', 'calc.save': 'Économie', 'calc.extra': 'Surcoût',
    'calc.vs': 'Ici plutôt qu’à {name}', 'calc.nearestYou': 'La plus proche de vous', 'calc.nearestHere': 'La plus proche d’ici',
    'calc.isNearest': 'C’est la station la plus proche de vous.',
    'calc.vsAvg': 'Ici plutôt qu’au prix moyen', 'calc.avgRegion': 'Moyenne de la région', 'calc.avgQc': 'Moyenne du Québec',
    'calc.fill': 'Plein de {L} L de {fuelL} à {p}¢/L : {total}',
    'watch.hit': 'Prix cible atteint : {name}, {p}¢ ({fuel})', 'watch.hits': '{n} favoris sont sous votre prix cible',
    'watch.line': 'Cible {t}¢ · {fuel}', 'watch.lineHit': ' · atteinte ({p}¢)', 'watch.lineNow': ' · actuel {p}¢',
    'watch.hint': 'Ajoutez cette station aux favoris pour fixer un prix cible.',
    'watch.title': 'Alerte de prix', 'watch.ok': 'Cible atteinte', 'watch.until': 'Je vous le dirai sous {p}¢', 'watch.remove': 'Retirer',
    'watch.desc': 'Vérifiée à chaque ouverture de l’app et à chaque mise à jour ({fuel}).',
    'watch.label': 'Prix cible (¢/L)', 'watch.activate': 'Activer',
    'watch.enter': 'Entrez un prix cible, par exemple {ex}', 'watch.on': 'Alerte activée sous {p}¢', 'watch.cleared': 'Alerte retirée',
    'hist.title': 'Historique des prix', 'hist.loading': 'Chargement…',
    'hist.flat': 'Le prix n’a pas bougé depuis le début des relevés', 'hist.none': 'Pas encore de relevés pour cette station.',
    'hist.fill': ' Les prix sont enregistrés chaque heure : le graphique se remplit avec le temps.',
    'hist.unavail': 'Historique indisponible pour le moment', 'hist.offline': ' (hors ligne)',
    'hist.region': 'Moyenne {region} : {trend}.',
    'trend.flat': 'Stable depuis {span}', 'trend.down': 'En baisse de {d}¢ depuis {span}', 'trend.up': 'En hausse de {d}¢ depuis {span}',
    'span.lt1h': 'moins d’une heure', 'span.h': '{n} h', 'span.d': '{n} j',
    'chart.aria': 'Évolution du prix, de {a} à {b} cents', 'chart.now': 'maintenant',
    'heat.toast': 'Touchez la carte près d’une station pour voir sa fiche',
    'radar.loading': 'Les prix se chargent encore…', 'radar.none': 'Aucune station à moins de 25 km avec ces filtres.',
    'radar.title': 'Radar des aubaines', 'radar.aria': 'Radar : les {n} stations les moins chères dans un rayon de {r} km',
    'radar.summary': '{n} moins chers dans {r} km · {fuel}', 'radar.under': ' · jusqu’à {d}¢ sous la moyenne des alentours',
    'radar.map': 'Voir sur la carte',
    'share.noPrice': 'Pas de prix à partager pour ce carburant',
    'share.headCheapest': '{fuel} le moins cher à', 'share.head': '{fuel} à',
    'share.textCheapest': '{fuel} le moins cher à {place} en ce moment : {p}¢/L chez {name} (Le Plein)',
    'share.text': '{fuel} à {place} : {p}¢/L chez {name} (Le Plein)',
    'share.title': 'Partager', 'share.creating': 'Création de l’image…', 'share.go': 'Partager l’image', 'share.save': 'Enregistrer', 'share.copy': 'Copier le texte',
    'share.imgFail': 'L’image n’a pas pu être créée. Vous pouvez quand même copier le texte.', 'share.fail': 'Partage impossible',
    'share.saved': 'Image enregistrée', 'share.copied': 'Texte copié', 'share.copyFail': 'Copie impossible',
    'share.when': 'Relevé du {date}', 'card.tag': 'PRIX DE L’ESSENCE · QUÉBEC',
    'filters.title': 'Filtres et réglages', 'filters.region': 'Région', 'filters.brand': 'Bannière',
    'filters.allRegions': 'Toutes les régions', 'filters.allBrands': 'Toutes les bannières',
    'filters.max': 'Prix maximum (¢/L)', 'filters.none': 'Aucun', 'filters.maxHelp': 'S’applique au carburant choisi : {fuel}.',
    'filters.radius': 'Rayon de la liste', 'filters.radiusAll': 'Tout le Québec', 'filters.km': '{n} km',
    'filters.radiusNone': 'Aucune limite de distance.', 'filters.radiusUser': 'Stations à moins de {r} km de votre position.',
    'filters.radiusNoUser': 'Le rayon s’applique dès que votre position est connue. Activez-la pour l’utiliser.',
    'filters.radiusToast': 'Recherche de votre position pour appliquer le rayon…',
    'theme.label': 'Thème', 'theme.auto': 'Auto', 'theme.light': 'Jour', 'theme.dark': 'Nuit', 'lang.label': 'Langue',
    'filters.reset': 'Réinitialiser', 'filters.see': plural('Voir {n} station', 'Voir {n} stations'),
    'filters.attrib': 'Données : Régie de l’énergie du Québec · Carte © OpenStreetMap',
    'price.na': 'NON DISPONIBLE', 'price.aria': '{p} cents le litre',
    'brand.independent': 'Indépendant',
  },
  en: {
    'meta.title': 'Le Plein · Gas prices in Québec',
    'meta.desc': 'Find the cheapest gas near you in Québec. Data: Régie de l’énergie du Québec.',
    'search.placeholder': 'City, address or brand', 'search.aria': 'Search',
    'filters.aria': 'Filters and settings', 'filters.ariaActive': 'Filters and settings (active)',
    'fuel.group': 'Fuel', 'fuel.0': 'Regular', 'fuel.1': 'Premium', 'fuel.2': 'Diesel',
    'radar.aria': 'Deal radar near me', 'heat.aria': 'Price heat map', 'locate.aria': 'My location',
    'view.map': 'Map', 'view.list': 'Station list', 'view.favs': 'Favourites',
    'heat.title': 'Prices relative to the region', 'heat.low': 'Low', 'heat.mid': 'Average', 'heat.high': 'High',
    'sort.group': 'Sort', 'sort.price': 'Price', 'sort.dist': 'Distance',
    'credit': 'Data: Régie de l’énergie du Québec',
    'loading': 'Filling up on prices…',
    'nav.label': 'Navigation', 'nav.map': 'Map', 'nav.list': 'List', 'nav.favs': 'Favourites',
    'noscript': 'Le Plein needs JavaScript to show prices.',
    'fresh.loading': 'Loading…', 'fresh.offline': 'Offline · prices {age}', 'fresh.stale': 'Prices {age}', 'fresh.refresh': 'Refresh',
    'age.now': 'just now', 'age.min': '{n} min ago', 'age.h': '{n} h ago', 'age.d': '{n} d ago',
    'toast.updated': 'Prices up to date',
    'toast.refreshFail': 'Couldn’t refresh. Showing prices from the last update.',
    'toast.loadFail': 'Couldn’t load prices. Check your connection.',
    'map.fail': 'The map couldn’t load. The list is still available.',
    'cluster.aria': '{n} stations, from {p} cents', 'cluster.n': '{n} stations',
    'pin.title': '{name}, {p} cents',
    'best.none': 'No stations in this area', 'best.noneHint': 'Move the map or adjust the filters.',
    'best.title': 'Cheapest here', 'best.aria': 'Cheapest in this area: {name}, {p} cents. Open details',
    'me.aria': 'Your location',
    'loc.unavailable': 'Location isn’t available on this device.',
    'loc.denied': 'Location denied. Allow it in your browser settings.',
    'loc.notfound': 'Can’t find your location right now.',
    'loc.searching': 'Finding your location…',
    'list.nearTitle': 'Near you',
    'list.nearBody': 'Turn on location to sort by distance. Otherwise, here are the cheapest in Québec.',
    'list.enable': 'Turn on',
    'list.emptyTitle': 'No stations found', 'list.emptyRadius': 'None within {r} km with these filters. ',
    'list.emptyHint': 'Try widening the search or resetting the filters.', 'filters.btn': 'Filters',
    'list.more': 'Show more ({n})',
    'favs.title': 'Favourites', 'favs.emptyTitle': 'No favourites yet',
    'favs.emptyBody': 'Tap the heart on a station’s details to find it here, with its current price.',
    'favs.missing': '{n} favourite(s) missing from the current data (station closed?).',
    'fuel.na': '{fuel} n/a', 'fav.label': 'Favourite',
    'share.aria': 'Share', 'fav.add': 'Add to favourites', 'fav.remove': 'Remove from favourites', 'close': 'Close',
    'level.cheap': 'Low price', 'level.avg': 'Average', 'level.pricey': 'High',
    'best.tag': 'Best price near you',
    'sign.head': 'Posted prices', 'sign.unit': '¢ / litre',
    'avg.same': 'About average', 'avg.below': '{d}¢ below the regional average', 'avg.above': '{d}¢ above the regional average',
    'details.title': 'Station details', 'details.brand': 'Brand: ', 'details.operator': 'Operator: ', 'details.region': 'Region: ', 'details.addr': 'Address: ',
    'directions': 'Directions', 'directions.opens': 'Opens {app} · Data: Régie de l’énergie du Québec',
    'app.apple': 'Apple Maps', 'app.google': 'Google Maps',
    'back.station': 'Back to station',
    'fav.added': 'Added to favourites', 'fav.removed': 'Removed from favourites',
    'calc.title': 'Savings calculator', 'calc.litres': 'Litres', 'calc.litresAria': 'Litres to fill',
    'calc.same': 'Same price', 'calc.save': 'Savings', 'calc.extra': 'Extra cost',
    'calc.vs': 'Here rather than {name}', 'calc.nearestYou': 'Closest to you', 'calc.nearestHere': 'Closest to here',
    'calc.isNearest': 'This is the station closest to you.',
    'calc.vsAvg': 'Here rather than the average price', 'calc.avgRegion': 'Regional average', 'calc.avgQc': 'Québec average',
    'calc.fill': 'Fill-up of {L} L of {fuelL} at {p}¢/L: {total}',
    'watch.hit': 'Target price reached: {name}, {p}¢ ({fuel})', 'watch.hits': '{n} favourites are below your target price',
    'watch.line': 'Target {t}¢ · {fuel}', 'watch.lineHit': ' · reached ({p}¢)', 'watch.lineNow': ' · now {p}¢',
    'watch.hint': 'Add this station to your favourites to set a target price.',
    'watch.title': 'Price alert', 'watch.ok': 'Target reached', 'watch.until': 'I’ll tell you below {p}¢', 'watch.remove': 'Remove',
    'watch.desc': 'Checked each time you open the app and at every update ({fuel}).',
    'watch.label': 'Target price (¢/L)', 'watch.activate': 'Set alert',
    'watch.enter': 'Enter a target price, for example {ex}', 'watch.on': 'Alert set below {p}¢', 'watch.cleared': 'Alert removed',
    'hist.title': 'Price history', 'hist.loading': 'Loading…',
    'hist.flat': 'The price hasn’t moved since records began', 'hist.none': 'No records for this station yet.',
    'hist.fill': ' Prices are recorded every hour: the chart fills in over time.',
    'hist.unavail': 'History unavailable right now', 'hist.offline': ' (offline)',
    'hist.region': '{region} average: {trend}.',
    'trend.flat': 'Steady for {span}', 'trend.down': 'Down {d}¢ over {span}', 'trend.up': 'Up {d}¢ over {span}',
    'span.lt1h': 'less than an hour', 'span.h': '{n} h', 'span.d': '{n} d',
    'chart.aria': 'Price trend, from {a} to {b} cents', 'chart.now': 'now',
    'heat.toast': 'Tap the map near a station to see its details',
    'radar.loading': 'Prices are still loading…', 'radar.none': 'No stations within 25 km with these filters.',
    'radar.title': 'Deal radar', 'radar.aria': 'Radar: the {n} cheapest stations within {r} km',
    'radar.summary': '{n} cheapest within {r} km · {fuel}', 'radar.under': ' · up to {d}¢ below the average nearby',
    'radar.map': 'See on map',
    'share.noPrice': 'No price to share for this fuel',
    'share.headCheapest': 'Cheapest {fuelL} in', 'share.head': '{fuel} in',
    'share.textCheapest': 'Cheapest {fuelL} in {place} right now: {p}¢/L at {name} (Le Plein)',
    'share.text': '{fuel} in {place}: {p}¢/L at {name} (Le Plein)',
    'share.title': 'Share', 'share.creating': 'Creating the image…', 'share.go': 'Share the image', 'share.save': 'Save', 'share.copy': 'Copy text',
    'share.imgFail': 'The image couldn’t be created. You can still copy the text.', 'share.fail': 'Couldn’t share',
    'share.saved': 'Image saved', 'share.copied': 'Text copied', 'share.copyFail': 'Couldn’t copy',
    'share.when': 'Prices as of {date}', 'card.tag': 'GAS PRICES · QUÉBEC',
    'filters.title': 'Filters and settings', 'filters.region': 'Region', 'filters.brand': 'Brand',
    'filters.allRegions': 'All regions', 'filters.allBrands': 'All brands',
    'filters.max': 'Maximum price (¢/L)', 'filters.none': 'None', 'filters.maxHelp': 'Applies to the selected fuel: {fuel}.',
    'filters.radius': 'List radius', 'filters.radiusAll': 'All of Québec', 'filters.km': '{n} km',
    'filters.radiusNone': 'No distance limit.', 'filters.radiusUser': 'Stations within {r} km of your location.',
    'filters.radiusNoUser': 'The radius applies as soon as your location is known. Turn it on to use it.',
    'filters.radiusToast': 'Finding your location to apply the radius…',
    'theme.label': 'Theme', 'theme.auto': 'Auto', 'theme.light': 'Day', 'theme.dark': 'Night', 'lang.label': 'Language',
    'filters.reset': 'Reset', 'filters.see': plural('See {n} station', 'See {n} stations'),
    'filters.attrib': 'Data: Régie de l’énergie du Québec · Map © OpenStreetMap',
    'price.na': 'NOT AVAILABLE', 'price.aria': '{p} cents per litre',
    'brand.independent': 'Independent',
  },
};

/** t('age.min', { n: 5 }) -> "il y a 5 min". Falls back to French, then to the key. */
export function t(key, vars = {}) {
  let v = DICT[lang][key] ?? DICT.fr[key] ?? key;
  if (typeof v === 'function') v = v(vars);
  return v.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
}

export const fuelName = (i) => t('fuel.' + i);
export const fuelLower = (i) => fuelName(i).toLowerCase();
/** The feed has no brand for independents; the app stores it as 'Indépendant' and shows it in the current language. */
export const INDEPENDENT = 'Indépendant';
export const brandLabel = (b) => (b === INDEPENDENT ? t('brand.independent') : b);

export function setLang(l) {
  if (!LANGS.includes(l) || l === lang) return false;
  lang = l;
  try { localStorage.setItem(KEY, JSON.stringify(l)); } catch { /* private mode */ }
  document.documentElement.lang = l;
  return true;
}

/** Fills the static HTML: [data-i18n] sets the text; [data-i18n-attr="aria-label:key;placeholder:key"] sets attributes. */
export function applyStatic(root = document) {
  document.title = t('meta.title');
  const m = document.querySelector('meta[name="description"]');
  if (m) m.content = t('meta.desc');
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    for (const pair of el.dataset.i18nAttr.split(';')) {
      const [a, k] = pair.split(':');
      if (a && k) el.setAttribute(a, t(k));
    }
  });
}
