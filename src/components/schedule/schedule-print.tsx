"use client";

import { Fragment } from "react";
import { cn } from "@/lib/utils";
import { composeDay, type CellPerson } from "@/lib/utils/schedule-compose";
import type { ScheduleMonthData } from "@/lib/types/schedule";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const pad2 = (n: number) => String(n).padStart(2, "0");

function Names({ people }: { people: CellPerson[] }) {
  return (
    <>
      {people.map((p) => (
        <span
          key={p.user_id}
          className={cn(
            "mr-0.5 inline-block whitespace-nowrap rounded-[1px] px-0.5",
            p.surgery ? "bg-yellow-200" : p.pathology ? "bg-pink-200" : "",
          )}
        >
          {p.name}
          {p.tag ? `(${p.tag})` : ""}
        </span>
      ))}
    </>
  );
}

export function SchedulePrint({ data, ym, teamLabel }: { data: ScheduleMonthData; ym: string; teamLabel?: string }) {
  const [y, m] = ym.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const first = new Date(y, m - 1, 1).getDay();

  const cells: (string | null)[] = [
    ...Array<null>(first).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${y}-${pad2(m)}-${pad2(i + 1)}`),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const td = "border border-gray-400 align-top p-0.5";

  return (
    <div
      id="schedule-print"
      className="hidden bg-white text-black [print-color-adjust:exact] [-webkit-print-color-adjust:exact] print:block"
    >
      <style>{`@media print { @page { size: A4 landscape; margin: 5mm; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`}</style>
      <h2 className="mb-1 text-center text-sm font-bold">
        {y}년 {m}월 근무표{teamLabel ? ` — ${teamLabel}` : ""}
      </h2>
      <table className="w-full table-fixed border-collapse text-[6.5px] leading-tight">
        <colgroup>
          <col className="w-[5%]" />
          {WEEKDAYS.map((w) => (
            <col key={w} className="w-[13.5%]" />
          ))}
        </colgroup>
        <tbody>
          {weeks.map((week, wi) => (
            <Fragment key={wi}>
              {/* 날짜 헤더 */}
              <tr className="bg-gray-100 font-bold">
                <td className={td}></td>
                {week.map((d, i) => (
                  <td key={i} className={cn(td, "text-center")}>
                    {d ? `${WEEKDAYS[i]} ${Number(d.slice(8))}` : ""}
                  </td>
                ))}
              </tr>
              {/* 시프트별 */}
              {data.shifts.map((sh) => (
                <tr key={sh.id}>
                  <td className={cn(td, "text-center font-semibold")}>{sh.start_time}</td>
                  {week.map((d, i) => {
                    const comp = d ? composeDay(data, d) : null;
                    const grp = comp?.groups.find((g) => g.shift.id === sh.id);
                    return (
                      <td key={i} className={td}>
                        {grp ? <Names people={grp.people} /> : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {/* 휴무 */}
              <tr>
                <td className={cn(td, "text-center font-semibold")}>휴무</td>
                {week.map((d, i) => {
                  const comp = d ? composeDay(data, d) : null;
                  return (
                    <td key={i} className={cn(td, "text-blue-700")}>
                      {comp ? <Names people={comp.off} /> : null}
                    </td>
                  );
                })}
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
