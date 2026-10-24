import { memo } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

const fmtTime = (ts) => new Date(ts).toLocaleTimeString("id-ID", { hour12: false });

function LiveChart({ title, unit, color, points }) {
  const data = {
    labels: points.map((p) => fmtTime(p.ts)),
    datasets: [
      {
        label: `${title} (${unit})`,
        data: points.map((p) => p.value),
        borderColor: color,
        backgroundColor: `${color}22`,
        fill: true,
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false, // update real-time tanpa animasi ulang agar ringan
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (c) => ` ${c.parsed.y} ${unit}` } },
    },
    scales: {
      x: { ticks: { color: "#8b95a7", maxTicksLimit: 6 }, grid: { color: "#1f2937" } },
      y: { ticks: { color: "#8b95a7" }, grid: { color: "#1f2937" } },
    },
  };

  return (
    <div className="chart-wrap">
      <Line data={data} options={options} />
    </div>
  );
}

export default memo(LiveChart);