import type { FixedEvent, HouseholdMember } from "@/lib/planner/types";

export type BirthdayCountdown = {
  age: number;
  daysUntilBirthday: number;
  nextAge: number;
};

export function getBirthdayCountdown(
  member: Pick<HouseholdMember, "birthDate">,
  referenceDate: string,
): BirthdayCountdown | null {
  if (!member.birthDate) {
    return null;
  }

  const birthDate = parseDateKey(member.birthDate);
  const reference = parseDateKey(referenceDate);

  if (!birthDate || !reference) {
    return null;
  }

  const birthdayThisYear = new Date(reference.year, birthDate.month - 1, birthDate.day);
  const referenceDay = new Date(reference.year, reference.month - 1, reference.day);
  const birthdayHasPassed = birthdayThisYear.getTime() < referenceDay.getTime();
  const nextBirthdayYear = birthdayHasPassed ? reference.year + 1 : reference.year;
  const nextBirthday = new Date(nextBirthdayYear, birthDate.month - 1, birthDate.day);
  const daysUntilBirthday = Math.round(
    (nextBirthday.getTime() - referenceDay.getTime()) / (24 * 60 * 60 * 1000),
  );
  const age = reference.year - birthDate.year - (birthdayHasPassed ? 0 : birthdayThisYear > referenceDay ? 1 : 0);

  return {
    age,
    daysUntilBirthday,
    nextAge: daysUntilBirthday === 0 ? age : age + 1,
  };
}

export function getBirthdayEventsForDate(
  members: HouseholdMember[],
  date: string,
): FixedEvent[] {
  const target = parseDateKey(date);

  if (!target) {
    return [];
  }

  return members.flatMap((member) => {
    const birthDate = parseDateKey(member.birthDate);

    if (!birthDate || birthDate.month !== target.month || birthDate.day !== target.day) {
      return [];
    }

    return [
      {
        id: `birthday-${member.id}-${date}`,
        source: "member-birthdays",
        sourceUid: `${member.id}-${date}`,
        date,
        startTime: "00:00",
        endTime: "23:59",
        title: `${member.preferredName} Birthday`,
        category: "birthday",
        calendarBehavior: "fixed",
        assignedMemberIds: [member.id],
      },
    ];
  });
}

export function getBirthdayEventsForRange(
  members: HouseholdMember[],
  startsOn: string,
  endsOn: string,
): FixedEvent[] {
  const start = parseDateKey(startsOn);
  const end = parseDateKey(endsOn);

  if (!start || !end) {
    return [];
  }

  const events: FixedEvent[] = [];
  const current = new Date(start.year, start.month - 1, start.day);
  const finalDate = new Date(end.year, end.month - 1, end.day);

  while (current <= finalDate) {
    events.push(...getBirthdayEventsForDate(members, toDateKey(current)));
    current.setDate(current.getDate() + 1);
  }

  return events;
}

function parseDateKey(date?: string) {
  if (!date) {
    return null;
  }

  const [year, month, day] = date.split("-").map(Number);

  if (!year || !month || !day) {
    return null;
  }

  return {
    day,
    month,
    year,
  };
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
