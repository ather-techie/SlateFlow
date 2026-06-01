// Re-export all types for backward compatibility
export type {
  AuthUser,
  User,
  ProjectAccessEntry,
  Notification,
} from './auth'

export type {
  Card,
  Lane,
  Column,
  Task,
  TaskSummary,
  BacklogCard,
  Dependency,
  DependencyList,
  LanePreset,
  LaneWithCount,
} from './board'

export type {
  Project,
  Sprint,
  Epic,
  Feature,
  RoadmapEpic,
  ProjectSummary,
  DashboardStats,
} from './planning'

export type {
  CalendarEntryKind,
  EntryFormKind,
  EntryEditing,
  CalendarSprintEntry,
  CalendarEpicEntry,
  CalendarFeatureEntry,
  CalendarHoliday,
  CalendarEvent,
  CalendarVacation,
  CalendarRange,
} from './calendar'

export type {
  RetroCategory,
  Retrospective,
  RetroItem,
} from './retro'

export type {
  VelocityEntry,
  CycleTimeEntry,
  CapacityEntry,
} from './reports'

export type {
  Comment,
  Label,
  ActivityLog,
  ActivityItem,
  CardLink,
} from './integrations'

export type {
  TestSuite,
  TestStep,
  TestStatus,
  TestPriority,
  TestCase,
  TestRun,
  TestCaseSummary,
} from './testing'
