/* What's Happening? - demonstration dataset.
   Every event, performer, venue, team and channel in this file is INVENTED for demonstration.
   No ticket, streaming or official URLs are attached, because none exist for invented events.
   Real events appear once a Ticketmaster or YouTube key is saved in Settings. */
window.WHATS = (function () {
  'use strict';
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function at(off, t) {
    var d = new Date();
    d.setDate(d.getDate() + off);
    var p = t.split(':');
    d.setHours(+p[0], +p[1], 0, 0);
    return d;
  }
  function stamp(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  var CITIES = [
    { id: 'greenville-sc', label: 'Greenville, SC', lat: 34.8526, lng: -82.3940, tz: 'America/New_York' },
    { id: 'charlotte-nc', label: 'Charlotte, NC', lat: 35.2271, lng: -80.8431, tz: 'America/New_York' },
    { id: 'asheville-nc', label: 'Asheville, NC', lat: 35.5951, lng: -82.5515, tz: 'America/New_York' },
    { id: 'boone-nc', label: 'Boone, NC', lat: 36.2168, lng: -81.6746, tz: 'America/New_York' },
    { id: 'atlanta-ga', label: 'Atlanta, GA', lat: 33.7490, lng: -84.3880, tz: 'America/New_York' },
    { id: 'chicago-il', label: 'Chicago, IL', lat: 41.8781, lng: -87.6298, tz: 'America/Chicago' },
    { id: 'austin-tx', label: 'Austin, TX', lat: 30.2672, lng: -97.7431, tz: 'America/Chicago' },
    { id: 'denver-co', label: 'Denver, CO', lat: 39.7392, lng: -104.9903, tz: 'America/Denver' },
    { id: 'seattle-wa', label: 'Seattle, WA', lat: 47.6062, lng: -122.3321, tz: 'America/Los_Angeles' },
    { id: 'new-york-ny', label: 'New York, NY', lat: 40.7128, lng: -74.0060, tz: 'America/New_York' }
  ];

  var CATEGORIES = [
    { id: 'comedy', label: 'Comedy', short: 'Comedy', hue: 26, icon: 'mic' },
    { id: 'music', label: 'Concerts', short: 'Music', hue: 282, icon: 'music' },
    { id: 'sports', label: 'Sports', short: 'Sports', hue: 202, icon: 'trophy' },
    { id: 'outdoor', label: 'Ski & Outdoor', short: 'Outdoor', hue: 164, icon: 'mountain' },
    { id: 'festival', label: 'Festivals', short: 'Festival', hue: 44, icon: 'spark' },
    { id: 'online', label: 'Online', short: 'Online', hue: 322, icon: 'play' }
  ];

  var PEOPLE = [
    { id: 'maya-okafor', name: 'Maya Okafor', kind: 'comedian', blurb: 'Club comic known for dense, rapid-fire sets about family, money and the South.', related: ['trey-beaumont', 'danny-voss'] },
    { id: 'danny-voss', name: 'Danny Voss', kind: 'comedian', blurb: 'Late-night host of the Dark Room, and a comic who does not record his sets.', related: ['maya-okafor'] },
    { id: 'ruthie-vance', name: 'Ruthie Vance', kind: 'comedian', blurb: 'Storytelling comic who builds hours slowly and out of order.', related: ['maya-okafor'] },
    { id: 'trey-beaumont', name: 'Trey Beaumont', kind: 'comedian', blurb: 'Touring headliner, two specials, currently rebuilding the act from scratch.', related: ['danny-voss'] },
    { id: 'ostrich-hour', name: 'Ostrich Hour', kind: 'troupe', blurb: 'Longform improv troupe with a monthly live stream and no fixed format.', related: ['late-shift'] },
    { id: 'late-shift', name: 'The Late Shift Podcast', kind: 'podcast', blurb: 'Weekly comedy podcast recorded in front of a live audience.', related: ['ostrich-hour'] },
    { id: 'wild-concessions', name: 'The Wild Concessions', kind: 'band', blurb: 'Six-piece that treats every set like the last song of the night.', related: ['junebug-tide'] },
    { id: 'silverlake-static', name: 'Silverlake Static', kind: 'band', blurb: 'Loud, melodic, and touring behind a record recorded in one weekend.', related: ['junebug-tide'] },
    { id: 'junebug-tide', name: 'Junebug & the Tide', kind: 'band', blurb: 'Slow-burning country-soul with a horn section.', related: ['silverlake-static'] },
    { id: 'nomi-sen', name: 'Nomi Sen', kind: 'band', blurb: 'Composer and pianist who plays halls, stairwells and the occasional barn.', related: ['copper-fields'] },
    { id: 'copper-fields', name: 'Copper Fields', kind: 'band', blurb: 'Acoustic trio that streams from a converted barn once a season.', related: ['nomi-sen'] },
    { id: 'icehawks', name: 'Upstate Icehawks', kind: 'team', blurb: 'Hockey club on a three-game run, conference rivals with Ohio.', related: ['carolina-forge'] },
    { id: 'carolina-forge', name: 'Carolina Forge', kind: 'team', blurb: 'Baseball club with the deepest bullpen in the division.', related: ['icehawks'] },
    { id: 'palmetto-harvest', name: 'Palmetto Harvest', kind: 'team', blurb: 'Basketball side chasing the top seed.', related: ['blue-ridge-rovers'] },
    { id: 'blue-ridge-rovers', name: 'Blue Ridge Rovers', kind: 'team', blurb: 'Mountain-based basketball club, rivalry game pending.', related: ['palmetto-harvest'] },
    { id: 'dark-horse', name: 'Dark Horse FC', kind: 'team', blurb: 'Football club with a sold-out supporters section.', related: ['palmetto-harvest'] }
  ];

  var CHANNELS = [
    { id: 'late-shift-live', name: 'Late Shift Live', blurb: 'Live comedy podcast broadcast, weekly.' },
    { id: 'backline-sessions', name: 'Backline Sessions', blurb: 'Bands playing full records in unusual rooms.' },
    { id: 'third-shift', name: 'Third Shift Gaming', blurb: 'Tournament coverage and long-form streams.' },
    { id: 'ostrich-live', name: 'Ostrich Hour Live', blurb: 'Improv built from chat suggestions, in real time.' },
    { id: 'standup-dispatch', name: 'Standup Dispatch', blurb: 'Scheduled premieres of recorded comedy specials.' }
  ];

  /* [dayOffset, time, durationMin, category, presence, title, venue, cityId, lat, lng, blurb, popularity, extras] */
  var ROWS = [
    [1, '20:00', 90, 'comedy', 'in-person', 'Late Show: Maya Okafor', 'The Laughing Crow', 'greenville-sc', 34.8531, -82.3982, 'A tight, joke-dense hour from one of the sharpest club comics on the Southeast circuit. Two-drink minimum, seating first come.', 88, { price: 32, performers: ['maya-okafor'], tags: ['stand-up', 'club'] }],
    [0, '21:30', 75, 'comedy', 'in-person', 'Dark Room: Uncensored', 'Radio Room Annex', 'greenville-sc', 34.8502, -82.4051, 'No phones, no clips, no material you will hear anywhere else. A late room built for comics taking real swings.', 64, { price: 18, performers: ['danny-voss'], tags: ['dark comedy', 'late night'] }],
    [2, '19:00', 120, 'comedy', 'in-person', 'Ostrich Hour: Longform Improv', 'The Spillway', 'charlotte-nc', 35.2248, -80.8431, 'One suggestion from the audience, one unbroken hour. The troupe has never performed the same show twice.', 71, { price: 15, performers: ['ostrich-hour'], tags: ['improv', 'alternative'] }],
    [4, '20:30', 90, 'comedy', 'in-person', 'Ruthie Vance: Work in Progress', 'Foxglove Theatre', 'asheville-nc', 35.5951, -82.5515, 'New hour, half-finished, fully honest. Cheap ticket, no recording, and a real chance to watch material get built.', 58, { price: 12, performers: ['ruthie-vance'], tags: ['work in progress'] }],
    [6, '18:00', 100, 'comedy', 'both', 'The Late Shift Podcast - Live', 'Ironwood Hall', 'charlotte-nc', 35.2301, -80.8402, 'The weekly podcast recorded in front of a room, with a guest, a monologue and a segment that usually falls apart.', 82, { price: 25, performers: ['late-shift'], tags: ['podcast', 'live recording'] }],
    [9, '21:00', 80, 'comedy', 'in-person', 'Atlanta Comedy Showcase', 'Ponce Warehouse', 'atlanta-ga', 33.7723, -84.3655, 'Six comics, twelve minutes each, one very tall room. Lineup announced the week of the show.', 67, { price: 20, tags: ['showcase'] }],
    [11, '20:00', 95, 'comedy', 'in-person', 'Trey Beaumont: New Material Night', 'Baker Street Club', 'atlanta-ga', 33.7592, -84.3878, 'A touring headliner working out an hour before it goes on the road. Tight room, loose show.', 61, { price: 24, performers: ['trey-beaumont'], tags: ['club'] }],
    [6, '19:30', 120, 'comedy', 'in-person', 'Chicago: The Wabash Late Set', 'Wabash Room', 'chicago-il', 41.8776, -87.6272, 'A long-running late set in a room with a low ceiling and no bad seats.', 80, { price: 34, tags: ['club', 'late night'] }],
    [18, '19:00', 120, 'comedy', 'in-person', 'Austin: Open Mic Finals', 'Congress Room', 'austin-tx', 30.2672, -97.7431, 'Twenty comics, one night, audience vote. The winner gets a paid weekend.', 54, { price: 10, tags: ['open mic'] }],
    [3, '19:30', 150, 'music', 'in-person', 'The Wild Concessions: Night Two', 'Lakeview Amphitheater', 'greenville-sc', 34.8409, -82.3812, 'Second night added after the first sold out, with a local five-piece opening and a horn section that shows up unannounced.', 90, { price: 45, performers: ['wild-concessions'], tags: ['tour'] }],
    [5, '20:00', 120, 'music', 'in-person', 'Silverlake Static / Junebug & the Tide', 'Highland Loft', 'asheville-nc', 35.5901, -82.5566, 'Two bands that share a drummer and a fondness for very long outros. Doors at seven.', 66, { price: 28, performers: ['silverlake-static', 'junebug-tide'], tags: ['double bill'] }],
    [8, '18:00', 240, 'festival', 'in-person', 'Riverbend Sound Festival', 'Riverbend Grounds', 'charlotte-nc', 35.2271, -80.8551, 'Three stages, twelve acts, and a strict no-overlapping-headliner rule. Gates open at five.', 93, { price: 89, tags: ['festival', 'outdoor'] }],
    [12, '19:00', 120, 'music', 'in-person', 'Nomi Sen: Solo Piano', 'Foxglove Theatre', 'asheville-nc', 35.5951, -82.5515, 'A rare small-room date for a composer who usually plays halls. No opener.', 55, { price: 38, performers: ['nomi-sen'], tags: ['acoustic'] }],
    [9, '20:00', 150, 'music', 'in-person', 'Brooklyn: Static Bloom at the Armory', 'Greenpoint Armory', 'new-york-ny', 40.7272, -73.9489, 'A converted drill hall, a very loud band, and a bar in the back that closes early.', 80, { price: 52, performers: ['silverlake-static'], tags: ['tour'] }],
    [15, '18:00', 120, 'music', 'in-person', 'Seattle: Nomi Sen in the Round', 'Pike Hall', 'seattle-wa', 47.6097, -122.3425, 'In-the-round seating with the audience on four sides and no bad sightline.', 61, { price: 44, performers: ['nomi-sen'], tags: ['acoustic'] }],
    [1, '19:00', 150, 'sports', 'in-person', 'Upstate Icehawks vs. Ohio Forge', 'Kestrel Arena', 'charlotte-nc', 35.2240, -80.8460, 'Conference rivals, both on a three-game run. Doors open ninety minutes before puck drop.', 86, { price: 42, performers: ['icehawks'], tags: ['hockey'] }],
    [2, '15:30', 180, 'sports', 'in-person', 'Carolina Forge vs. Gulfport Anchors', 'Foundry Park', 'greenville-sc', 34.8485, -82.4005, 'Day baseball with a doubleheader gate offer. The bullpen has been the story all month.', 70, { price: 18, performers: ['carolina-forge'], tags: ['baseball'] }],
    [3, '12:00', 240, 'sports', 'both', 'Palmetto Harvest vs. Blue Ridge Rovers', 'Piedmont Center', 'greenville-sc', 34.8561, -82.4067, 'Rivalry game with the top seed on the line. Broadcast availability is not confirmed by the club.', 78, { price: 36, performers: ['palmetto-harvest', 'blue-ridge-rovers'], tags: ['basketball'] }],
    [5, '20:00', 150, 'sports', 'both', 'Cardinal Card: Delgado vs. Osei', 'Grand Hall', 'atlanta-ga', 33.7553, -84.3902, 'Twelve-bout card with regional titles on the line. Streaming availability is unverified for this listing.', 84, { price: 65, tags: ['boxing', 'fight card'] }],
    [10, '13:00', 240, 'sports', 'in-person', 'Dark Horse FC vs. Harbor United', 'Kiln Field', 'charlotte-nc', 35.2155, -80.8492, 'Supporters section sold out; the rest of the ground is general admission.', 73, { price: 29, performers: ['dark-horse'], tags: ['soccer'] }],
    [7, '09:00', 480, 'outdoor', 'in-person', 'Summit Ridge Resort: Opening Day', 'Summit Ridge Resort', 'boone-nc', 36.1952, -81.7003, 'First chair of the season, with the upper mountain opening as conditions allow. Rental queues are shortest before ten.', 91, { price: 79, resort: { name: 'Summit Ridge Resort', verticalFt: 1200, status: 'Season opening - lift status set by the resort daily' }, tags: ['ski', 'opening day'] }],
    [14, '08:00', 600, 'outdoor', 'in-person', 'Cold Creek Nordic Center: Season Opener', 'Cold Creek Nordic Center', 'boone-nc', 36.2011, -81.6802, 'Roughly 18km of groomed classic track, with rentals and a warming hut open all day.', 57, { price: 26, resort: { name: 'Cold Creek Nordic Center', verticalFt: null, status: 'Volunteer-groomed, conditions posted at the hut' }, tags: ['nordic', 'ski'] }],
    [16, '10:00', 420, 'outdoor', 'in-person', 'Blue Knob Slopestyle Qualifier', 'Blue Knob Basin', 'asheville-nc', 35.6121, -82.4912, 'Open qualifier; registration closes the night before. Spectating is free from the base area.', 64, { price: 35, resort: { name: 'Blue Knob Basin', verticalFt: 800, status: 'Terrain park only' }, tags: ['snowboard', 'competition'] }],
    [21, '17:00', 300, 'outdoor', 'in-person', 'Firelight Snow Festival', 'Summit Ridge Resort', 'boone-nc', 36.1952, -81.7003, 'Torchlight descent, a very large fire, and a brass band at the base. Dress for standing around.', 76, { price: 20, resort: { name: 'Summit Ridge Resort', verticalFt: 1200, status: 'Base area only' }, tags: ['festival', 'winter'] }],
    [13, '10:00', 240, 'festival', 'in-person', 'Carolina Wings Airshow', 'Tri-County Airfield', 'greenville-sc', 34.8712, -82.3554, 'Static displays in the morning, flight demonstrations after midday. Ear protection recommended for children.', 69, { price: 15, tags: ['airshow', 'family'] }],
    [4, '11:00', 180, 'festival', 'in-person', 'Upstate Harvest Market', 'Courtyard Green', 'greenville-sc', 34.8512, -82.3961, 'Sixty growers, two stages of local music, and a pie contest that takes itself seriously.', 51, { price: 0, tags: ['free', 'market'] }],
    [0, '22:00', 60, 'comedy', 'online', 'Late Shift Live: Thursday Broadcast', 'Late Shift Live', '', null, null, 'The live version of the podcast, streamed from a converted garage with chat reading along.', 74, { channel: 'late-shift-live', tags: ['livestream', 'podcast'] }],
    [0, '19:00', 90, 'music', 'online', 'Backline Sessions: Mount Helix', 'Backline Sessions', '', null, null, 'The band plays the record front to back in a stairwell, mixed for headphones.', 62, { channel: 'backline-sessions', tags: ['livestream', 'performance'] }],
    [1, '19:00', 90, 'online', 'online', 'The Standup Dispatch - Premiere', 'Standup Dispatch', '', null, null, 'A recorded special released as a scheduled premiere, with chat live during the countdown.', 59, { channel: 'standup-dispatch', tags: ['premiere'], premiere: true }],
    [2, '20:00', 120, 'online', 'online', 'Copper Fields: Acoustic from the Barn', 'Copper Fields', '', null, null, 'Six songs, one microphone, no audience. Streamed once and taken down.', 63, { channel: 'copper-fields', tags: ['livestream', 'acoustic'] }],
    [0, 'now', 120, 'comedy', 'online', 'Build-a-Bit Live', 'Ostrich Hour', '', null, null, 'The troupe builds a sketch from chat suggestions in real time. Currently live.', 71, { channel: 'ostrich-live', nowOffsetMin: -30, tags: ['livestream', 'improv'] }],
    [8, '19:00', 120, 'music', 'online', 'Denver Sessions: Mount Helix (Encore)', 'Backline Sessions', '', null, null, 'An encore airing of a set recorded earlier this year, with a live Q&A afterwards.', 48, { channel: 'backline-sessions', tags: ['encore'] }],
    [0, '20:00', 180, 'sports', 'online', 'Winter Cup Finals - Day One', 'Third Shift Gaming', '', null, null, 'Group stage from four regions, played out live with a full desk.', 68, { channel: 'third-shift', tags: ['livestream', 'esports'] }]
  ];

  var EVENTS = ROWS.map(function (r, i) {
    var x = r[12] || {};
    var startsAt = x.nowOffsetMin != null ? new Date(Date.now() + x.nowOffsetMin * 60000) : at(r[0], r[1]);
    return {
      id: 'demo-' + (i + 1),
      source: 'demo',
      title: r[5],
      description: r[10],
      category: r[3],
      presence: r[4],
      startLocal: stamp(startsAt),
      duration: r[2],
      venue: r[6],
      cityId: r[7],
      lat: r[8],
      lng: r[9],
      popularity: r[11],
      performers: x.performers || [],
      tags: x.tags || [],
      price: x.price != null ? { min: x.price, max: x.price, currency: 'USD', verified: false } : null,
      ticketUrl: null,
      streamUrl: null,
      officialUrl: null,
      broadcast: x.broadcast || null,
      channel: x.channel || null,
      resort: x.resort || null,
      premiere: !!x.premiere,
      lastUpdated: new Date().toISOString()
    };
  });

  return { CITIES: CITIES, CATEGORIES: CATEGORIES, PEOPLE: PEOPLE, CHANNELS: CHANNELS, EVENTS: EVENTS, generated: new Date().toISOString() };
})();
