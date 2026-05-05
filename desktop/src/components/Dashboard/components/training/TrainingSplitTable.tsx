interface Props {
  plan: Record<string, { focus: string; exercises: string[] }> | null;
}

const DEFAULT_PLAN: Record<string, { focus: string; exercises: string[] }> = {
  周一: { focus: "上肢", exercises: ["推举", "划船", "侧平举", "弯举"] },
  周二: { focus: "休息/有氧", exercises: [] },
  周三: { focus: "下肢", exercises: ["深蹲", "硬拉", "腿弯举", "提踵"] },
  周四: { focus: "休息/有氧", exercises: [] },
  周五: { focus: "上肢", exercises: ["卧推", "引体向上", "飞鸟", "三头"] },
  周六: { focus: "休息/有氧", exercises: [] },
  周日: { focus: "休息/有氧", exercises: [] },
};

const TRAINING_DAYS = ["周一", "周三", "周五"];
const REST_DAYS = ["周二", "周四", "周六", "周日"];

export function TrainingSplitTable({ plan }: Props) {
  const split = plan ?? DEFAULT_PLAN;

  return (
    <div className="detail-section">
      <div className="detail-section-title">训练分化计划</div>
      <div className="card">
        <table className="split-table">
          <thead>
            <tr>
              <th>星期</th>
              <th>训练部位</th>
              <th>类型</th>
            </tr>
          </thead>
          <tbody>
            {TRAINING_DAYS.map((day) => (
              <tr key={day}>
                <td>{day}</td>
                <td>
                  {split[day]?.focus ?? (day === "周三" ? "下肢" : "上肢")}
                </td>
                <td className="split-type-strength">力量训练</td>
              </tr>
            ))}
            {REST_DAYS.map((day) => (
              <tr key={day}>
                <td>{day}</td>
                <td>—</td>
                <td className="split-type-rest">休息/有氧</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
