/*
 * ============================================================
 * STUDIUM KALENDER
 * ============================================================
 *
 * GitHub Pages:
 *
 * calendar.ics muss im gleichen Ordner wie diese Dateien liegen.
 *
 * Beispiel:
 *
 * https://username.github.io/studium-kalender/calendar.ics
 *
 * Einstellungen kannst du im CONFIG-Block ändern.
 * ============================================================
 */

const CONFIG = {
  // Name des Kalenders
  calendarName: "Studium",

  // ICS-Datei
  calendarFile: "calendar.ics",

  // Zeitzone
  timeZone: "Europe/Vienna",

  // Sprache
  locale: "de-DE",

  // Soll die ICS-Datei automatisch neu geladen werden?
  cacheBust: true,

  /*
   * Kurse:
   *
   * Hier kannst du später Farben und Anzeigenamen ändern.
   */
  courses: {
    "B22.0418306": {
      name: "Server Technologies",
      color: "#6366f1"
    },

    "B22.0418311": {
      name: "Visualisation and Data Mining",
      color: "#06b6d4"
    },

    "B22.0418317": {
      name: "Hackathon",
      color: "#f59e0b"
    },

    "B22.0418506": {
      name: "Research Skills & Practices",
      color: "#10b981"
    },

    "B22.0589506": {
      name: "Cross Cultural Communication",
      color: "#ec4899"
    },

    "M24.0590108": {
      name: "International Marketing & Market Research",
      color: "#8b5cf6"
    },

    "M24.0590107": {
      name: "Enterprise Resource Planning",
      color: "#ef4444"
    }
  }
};


/* ============================================================
 * STATE
 * ============================================================ */

let allEvents = [];
let filteredEvents = [];


/* ============================================================
 * DOM
 * ============================================================ */

const eventsContainer = document.getElementById("eventsContainer");
const eventCount = document.getElementById("eventCount");
const courseCount = document.getElementById("courseCount");
const nextEvent = document.getElementById("nextEvent");

const courseFilter = document.getElementById("courseFilter");
const locationFilter = document.getElementById("locationFilter");
const searchInput = document.getElementById("searchInput");

const clearFiltersButton = document.getElementById("clearFilters");

const loading = document.getElementById("loading");
const error = document.getElementById("error");
const empty = document.getElementById("empty");
const errorMessage = document.getElementById("errorMessage");

const calendarUrl = document.getElementById("calendarUrl");
const copyUrlButton = document.getElementById("copyUrlButton");

const subscribeButton = document.getElementById("subscribeButton");
const downloadButton = document.getElementById("downloadButton");

const resultInfo = document.getElementById("resultInfo");
const lastUpdated = document.getElementById("lastUpdated");


/* ============================================================
 * INITIALIZATION
 * ============================================================ */

document.addEventListener("DOMContentLoaded", async () => {
  setupCalendarUrl();
  setupEventListeners();

  try {
    await loadCalendar();
  } catch (err) {
    showError(err);
  }
});


/* ============================================================
 * CALENDAR URL
 * ============================================================ */

function setupCalendarUrl() {
  const baseUrl = window.location.href.substring(
    0,
    window.location.href.lastIndexOf("/") + 1
  );

  const url = `${baseUrl}${CONFIG.calendarFile}`;

  calendarUrl.textContent = url;

  /*
   * webcal:// funktioniert bei vielen Kalender-Apps
   * direkt als Kalender-Abonnement.
   */
  const webcalUrl = url.replace(/^https?:\/\//, "webcal://");

  subscribeButton.href = webcalUrl;
  subscribeButton.setAttribute("target", "_blank");

  downloadButton.href = CONFIG.calendarFile;
}


/* ============================================================
 * EVENT LISTENERS
 * ============================================================ */

function setupEventListeners() {
  searchInput.addEventListener("input", applyFilters);
  courseFilter.addEventListener("change", applyFilters);
  locationFilter.addEventListener("change", applyFilters);

  clearFiltersButton.addEventListener("click", () => {
    searchInput.value = "";
    courseFilter.value = "all";
    locationFilter.value = "all";

    applyFilters();
  });

  copyUrlButton.addEventListener("click", copyCalendarUrl);
}


/* ============================================================
 * LOAD ICS
 * ============================================================ */

async function loadCalendar() {
  setLoading(true);

  let url = CONFIG.calendarFile;

  if (CONFIG.cacheBust) {
    url += `?v=${Date.now()}`;
  }

  const response = await fetch(url, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(
      `Die Datei ${CONFIG.calendarFile} konnte nicht geladen werden.`
    );
  }

  const icsText = await response.text();

  allEvents = parseICS(icsText);

  /*
   * Nach UID sortieren wir nicht, sondern chronologisch.
   */
  allEvents.sort((a, b) => a.start - b.start);

  populateFilters();
  applyFilters();

  setLoading(false);

  lastUpdated.textContent =
    `Zuletzt geladen: ${new Intl.DateTimeFormat(CONFIG.locale, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date())}`;
}


/* ============================================================
 * ICS PARSER
 * ============================================================ */

function parseICS(icsText) {
  const unfolded = unfoldICS(icsText);

  const lines = unfolded.split(/\r?\n/);

  const events = [];

  let currentEvent = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      currentEvent = {};
      continue;
    }

    if (line === "END:VEVENT") {
      if (currentEvent) {
        const event = normalizeEvent(currentEvent);

        if (event) {
          events.push(event);
        }
      }

      currentEvent = null;
      continue;
    }

    if (!currentEvent) {
      continue;
    }

    const separator = line.indexOf(":");

    if (separator === -1) {
      continue;
    }

    const rawKey = line.substring(0, separator);
    const rawValue = line.substring(separator + 1);

    const key = rawKey.split(";")[0];

    currentEvent[key] = decodeICSValue(rawValue);
  }

  return events;
}


/*
 * RFC 5545 erlaubt sogenannte folded lines.
 */
function unfoldICS(text) {
  return text.replace(/\r?\n[ \t]/g, "");
}


/* ============================================================
 * EVENT NORMALIZATION
 * ============================================================ */

function normalizeEvent(raw) {
  if (!raw.DTSTART || !raw.SUMMARY) {
    return null;
  }

  const start = parseICSDate(raw.DTSTART);
  const end = raw.DTEND
    ? parseICSDate(raw.DTEND)
    : new Date(start.getTime() + 60 * 60 * 1000);

  if (!start || !end) {
    return null;
  }

  const courseId = extractCourseId(raw);

  const courseConfig = courseId
    ? findCourseConfig(courseId)
    : null;

  const description = raw.DESCRIPTION || "";

  return {
    uid: raw.UID || crypto.randomUUID(),

    start,
    end,

    title: courseConfig?.name || raw.SUMMARY,

    originalTitle: raw.SUMMARY,

    courseId,

    courseColor: courseConfig?.color || "#64748b",

    location: raw.LOCATION || "Kein Ort angegeben",

    description,

    lecturer: extractDescriptionField(
      description,
      "Dozent"
    ) || extractDescriptionField(
      description,
      "Dozenten"
    ),

    studyProgram: extractDescriptionField(
      description,
      "Studiengang"
    ),

    group: extractDescriptionField(
      description,
      "Gruppe"
    ),

    note:
      extractDescriptionField(description, "Notiz") ||
      extractDescriptionField(description, "Hinweis"),

    room:
      extractDescriptionField(description, "Raum") ||
      raw.LOCATION
  };
}


/* ============================================================
 * COURSE ID
 * ============================================================ */

function extractCourseId(raw) {
  const description = raw.DESCRIPTION || "";

  const match = description.match(
    /Kurs-ID:\s*([^\r\n\\]+)/i
  );

  if (match) {
    return match[1].trim();
  }

  return null;
}


function findCourseConfig(courseId) {
  if (!courseId) {
    return null;
  }

  const normalized = courseId.toUpperCase();

  const key = Object.keys(CONFIG.courses).find(
    id => id.toUpperCase() === normalized
  );

  return key ? CONFIG.courses[key] : null;
}


/* ============================================================
 * DESCRIPTION
 * ============================================================ */

function extractDescriptionField(description, field) {
  const regex = new RegExp(
    `${escapeRegExp(field)}:\\s*([^\\\\\\r\\n]+)`,
    "i"
  );

  const match = description.match(regex);

  return match ? match[1].trim() : "";
}


function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}


/* ============================================================
 * ICS DATE PARSER
 * ============================================================ */

function parseICSDate(value) {
  if (!value) {
    return null;
  }

  /*
   * UTC:
   * 20261001T084500Z
   */
  if (/^\d{8}T\d{6}Z$/.test(value)) {
    const year = Number(value.substring(0, 4));
    const month = Number(value.substring(4, 6)) - 1;
    const day = Number(value.substring(6, 8));

    const hour = Number(value.substring(9, 11));
    const minute = Number(value.substring(11, 13));
    const second = Number(value.substring(13, 15));

    return new Date(
      Date.UTC(
        year,
        month,
        day,
        hour,
        minute,
        second
      )
    );
  }

  /*
   * Europe/Vienna:
   * 20261001T084500
   *
   * Die Daten in deinem Kalender sind lokale Wiener Zeit.
   */
  const match = value.match(
    /^(\d{4})(\d{2})(\d{2})T?(\d{2})(\d{2})(\d{2})?$/
  );

  if (!match) {
    return new Date(value);
  }

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] || 0);

  /*
   * Für die Anzeige genügt die lokale Zeit.
   *
   * Date.UTC verhindert, dass der Browser die Zeit
   * abhängig von der lokalen Zeitzone des Benutzers verschiebt.
   */
  return new Date(
    Date.UTC(
      year,
      month,
      day,
      hour,
      minute,
      second
    )
  );
}


/* ============================================================
 * ICS VALUE DECODER
 * ============================================================ */

function decodeICSValue(value) {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}


/* ============================================================
 * FILTERS
 * ============================================================ */

function populateFilters() {
  const courses = new Map();
  const locations = new Set();

  for (const event of allEvents) {
    if (event.courseId) {
      courses.set(
        event.courseId,
        event.title
      );
    }

    if (event.location) {
      locations.add(event.location);
    }
  }

  /*
   * Kursfilter
   */
  courseFilter.innerHTML =
    `<option value="all">Alle Kurse</option>`;

  [...courses.entries()]
    .sort((a, b) => a[1].localeCompare(b[1], "de"))
    .forEach(([id, name]) => {
      const option = document.createElement("option");

      option.value = id;
      option.textContent = name;

      courseFilter.appendChild(option);
    });

  /*
   * Ortsfilter
   */
  locationFilter.innerHTML =
    `<option value="all">Alle Orte</option>`;

  [...locations]
    .sort((a, b) => a.localeCompare(b, "de"))
    .forEach(location => {
      const option = document.createElement("option");

      option.value = location;
      option.textContent = location;

      locationFilter.appendChild(option);
    });
}


function applyFilters() {
  const search = searchInput.value
    .trim()
    .toLowerCase();

  const selectedCourse = courseFilter.value;
  const selectedLocation = locationFilter.value;

  filteredEvents = allEvents.filter(event => {
    /*
     * Kursfilter
     */
    if (
      selectedCourse !== "all" &&
      event.courseId?.toUpperCase() !==
        selectedCourse.toUpperCase()
    ) {
      return false;
    }

    /*
     * Ortsfilter
     */
    if (
      selectedLocation !== "all" &&
      event.location !== selectedLocation
    ) {
      return false;
    }

    /*
     * Suche
     */
    if (search) {
      const searchable = [
        event.title,
        event.originalTitle,
        event.courseId,
        event.location,
        event.description,
        event.lecturer,
        event.studyProgram,
        event.group
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (!searchable.includes(search)) {
        return false;
      }
    }

    return true;
  });

  renderEvents();
  updateStats();
}


/* ============================================================
 * RENDER
 * ============================================================ */

function renderEvents() {
  eventsContainer.innerHTML = "";

  if (filteredEvents.length === 0) {
    empty.classList.remove("hidden");
    resultInfo.textContent = "";
    return;
  }

  empty.classList.add("hidden");

  resultInfo.textContent =
    `${filteredEvents.length} Termin${
      filteredEvents.length === 1 ? "" : "e"
    }`;

  /*
   * Gruppierung nach Datum
   */
  const groups = new Map();

  for (const event of filteredEvents) {
    const key = dateKey(event.start);

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(event);
  }

  for (const [date, events] of groups) {
    const day = document.createElement("div");

    day.className = "day-group";

    day.innerHTML = `
      <div class="day-header">
        <div class="day-name">
          ${formatDay(events[0].start)}
        </div>

        <div class="day-date">
          ${formatDate(events[0].start)}
        </div>
      </div>

      <div class="day-events"></div>
    `;

    const dayEvents = day.querySelector(".day-events");

    for (const event of events) {
      dayEvents.appendChild(createEventCard(event));
    }

    eventsContainer.appendChild(day);
  }
}


/* ============================================================
 * EVENT CARD
 * ============================================================ */

function createEventCard(event) {
  const article = document.createElement("article");

  article.className = "event-card";

  article.style.setProperty(
    "--course-color",
    event.courseColor
  );

  article.innerHTML = `
    <div class="event-time">
      <strong>${formatTime(event.start)}</strong>
      <span>– ${formatTime(event.end)}</span>
    </div>

    <div class="event-main">
      <div class="event-title-row">
        <h3>${escapeHTML(event.title)}</h3>

        ${
          event.courseId
            ? `<span class="course-id">
                ${escapeHTML(event.courseId)}
              </span>`
            : ""
        }
      </div>

      <div class="event-meta">
        ${
          event.location
            ? `<span>📍 ${escapeHTML(event.location)}</span>`
            : ""
        }

        ${
          event.lecturer
            ? `<span>👤 ${escapeHTML(event.lecturer)}</span>`
            : ""
        }

        ${
          event.group
            ? `<span>👥 ${escapeHTML(event.group)}</span>`
            : ""
        }
      </div>

      ${
        event.note
          ? `
            <div class="event-note">
              ${escapeHTML(event.note)}
            </div>
          `
          : ""
      }
    </div>
  `;

  return article;
}


/* ============================================================
 * STATS
 * ============================================================ */

function updateStats() {
  eventCount.textContent = filteredEvents.length;

  const uniqueCourses = new Set(
    filteredEvents
      .map(event => event.courseId || event.title)
      .filter(Boolean)
  );

  courseCount.textContent = uniqueCourses.size;

  const now = new Date();

  const upcoming = allEvents.find(
    event => event.start >= now
  );

  nextEvent.textContent = upcoming
    ? formatShortDate(upcoming.start)
    : "–";
}


/* ============================================================
 * DATE HELPERS
 * ============================================================ */

function dateKey(date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("-");
}


function formatDay(date) {
  return new Intl.DateTimeFormat(
    CONFIG.locale,
    {
      weekday: "long"
    }
  ).format(date);
}


function formatDate(date) {
  return new Intl.DateTimeFormat(
    CONFIG.locale,
    {
      day: "2-digit",
      month: "long",
      year: "numeric"
    }
  ).format(date);
}


function formatShortDate(date) {
  return new Intl.DateTimeFormat(
    CONFIG.locale,
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }
  ).format(date);
}


function formatTime(date) {
  return new Intl.DateTimeFormat(
    CONFIG.locale,
    {
      hour: "2-digit",
      minute: "2-digit"
    }
  ).format(date);
}


/* ============================================================
 * COPY
 * ============================================================ */

async function copyCalendarUrl() {
  try {
    await navigator.clipboard.writeText(
      calendarUrl.textContent
    );

    const original = copyUrlButton.textContent;

    copyUrlButton.textContent = "✓ Kopiert";

    setTimeout(() => {
      copyUrlButton.textContent = original;
    }, 2000);
  } catch {
    alert(
      "Die URL konnte nicht automatisch kopiert werden."
    );
  }
}


/* ============================================================
 * UI STATE
 * ============================================================ */

function setLoading(isLoading) {
  loading.classList.toggle("hidden", !isLoading);

  if (isLoading) {
    error.classList.add("hidden");
    empty.classList.add("hidden");
    eventsContainer.innerHTML = "";
  }
}


function showError(err) {
  setLoading(false);

  error.classList.remove("hidden");

  errorMessage.textContent =
    err?.message ||
    "Unbekannter Fehler beim Laden des Kalenders.";
}


/* ============================================================
 * SECURITY
 * ============================================================ */

function escapeHTML(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
