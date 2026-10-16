import { loadTemplates } from '../templates.ts'
import enMeetingNotes from './en/meeting-notes.json' with { type: 'json' }
import enProjectBrief from './en/project-brief.json' with { type: 'json' }
import enWeeklyUpdate from './en/weekly-update.json' with { type: 'json' }
import esMeetingNotes from './es/meeting-notes.json' with { type: 'json' }
import esProjectBrief from './es/project-brief.json' with { type: 'json' }
import esWeeklyUpdate from './es/weekly-update.json' with { type: 'json' }

// Imported, not read from disk, so that the domain does no I/O. Building the catalog here, as the module is
// evaluated, makes an invalid template stop the server from starting: the first import of this module throws.
export const builtInTemplates = loadTemplates({
  en: {
    'meeting-notes': enMeetingNotes,
    'project-brief': enProjectBrief,
    'weekly-update': enWeeklyUpdate,
  },
  es: {
    'meeting-notes': esMeetingNotes,
    'project-brief': esProjectBrief,
    'weekly-update': esWeeklyUpdate,
  },
})
