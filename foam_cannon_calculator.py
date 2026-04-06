#!/usr/bin/env python3
"""
泡沫壶喷芯直径计算工具

基于孔口流量方程、伯努利方程和工程经验，估算泡沫壶喷芯（孔板）直径的合理范围。

核心思路：
1. 机器给出流量 Q、工作压力 ΔP；
2. 喷芯可近似看成薄壁孔口：Q = Cd * A * sqrt(2 * ΔP / ρ)；
3. 由此反推喷芯截面积 A 和直径 d；
4. 用排出系数 Cd 和“喷芯实际可利用压差占整机压力比例”两个范围，给出一个更靠谱的工程区间。
"""

from __future__ import annotations

import argparse
import math
import sys
from dataclasses import dataclass, field
from typing import Optional

BAR_TO_PA = 100000.0
LPM_TO_M3S = 1.0 / 60000.0
WATER_DENSITY = 1000.0  # kg/m³

# 经验参数：可按后续实测再调
PUMP_EFFICIENCY_RANGE = (0.55, 0.75)
NOZZLE_PRESSURE_RATIO_RANGE = (0.80, 1.00)
DISCHARGE_COEFFICIENT_RANGE = (0.68, 0.82)
STANDARD_NOZZLE_SIZES_MM = [1.10, 1.15, 1.20, 1.25, 1.30, 1.35, 1.40, 1.50, 1.60, 1.80, 2.00]


@dataclass
class WasherSpec:
    """洗车机输入参数"""

    power_watts: float
    flow_rate_lpm: float
    pressure_bar: float
    pressure_is_estimated: bool = False


@dataclass
class PressureEstimate:
    """根据功率和流量反推的压力区间"""

    min_bar: float
    nominal_bar: float
    max_bar: float


@dataclass
class NozzleDesign:
    """喷芯设计结果"""

    diameter_min_mm: float
    diameter_nominal_mm: float
    diameter_max_mm: float
    closest_standard_mm: float
    nozzle_dp_min_bar: float
    nozzle_dp_max_bar: float
    jet_velocity_min_ms: float
    jet_velocity_max_ms: float
    hydraulic_power_watts: float
    required_input_power_min_watts: float
    required_input_power_max_watts: float
    power_based_pressure: PressureEstimate
    warnings: list[str] = field(default_factory=list)


def validate_positive(name: str, value: float) -> None:
    if value <= 0:
        raise ValueError(f"{name}必须大于0")


def lpm_to_m3s(flow_rate_lpm: float) -> float:
    return flow_rate_lpm * LPM_TO_M3S


def estimate_pressure_from_power(power_watts: float, flow_rate_lpm: float) -> PressureEstimate:
    """根据输入功率和流量，按泵效率区间反推可能工作压力。"""
    validate_positive("功率", power_watts)
    validate_positive("流量", flow_rate_lpm)

    flow_rate_m3s = lpm_to_m3s(flow_rate_lpm)
    pressure_min_bar = power_watts * PUMP_EFFICIENCY_RANGE[0] / flow_rate_m3s / BAR_TO_PA
    pressure_max_bar = power_watts * PUMP_EFFICIENCY_RANGE[1] / flow_rate_m3s / BAR_TO_PA
    pressure_nominal_bar = (pressure_min_bar + pressure_max_bar) / 2.0

    return PressureEstimate(
        min_bar=pressure_min_bar,
        nominal_bar=pressure_nominal_bar,
        max_bar=pressure_max_bar,
    )


def nozzle_diameter_mm(flow_rate_m3s: float, pressure_drop_pa: float, discharge_coefficient: float) -> float:
    """由孔口流量方程反推喷芯直径。"""
    if pressure_drop_pa <= 0:
        raise ValueError("压差必须大于0")
    if discharge_coefficient <= 0:
        raise ValueError("流量系数必须大于0")

    area_m2 = flow_rate_m3s / (discharge_coefficient * math.sqrt(2.0 * pressure_drop_pa / WATER_DENSITY))
    diameter_m = math.sqrt(4.0 * area_m2 / math.pi)
    return diameter_m * 1000.0


def closest_standard_size(diameter_mm: float) -> float:
    return min(STANDARD_NOZZLE_SIZES_MM, key=lambda size: abs(size - diameter_mm))


def build_warnings(spec: WasherSpec, design: NozzleDesign) -> list[str]:
    warnings: list[str] = []
    pressure = spec.pressure_bar
    flow = spec.flow_rate_lpm

    if pressure < 50:
        warnings.append("当前压力偏低，泡沫壶大概率只能出稀泡，难出稳定浓泡。")
    elif pressure > 180:
        warnings.append("当前压力偏高，选喷芯时要同时确认壶体、接头和密封件的承压能力。")

    if flow < 5:
        warnings.append("当前流量偏小，哪怕喷芯算对了，泡沫覆盖速度也可能偏慢。")
    elif flow > 12:
        warnings.append("当前流量偏大，可能需要更大的非标喷芯，普通 1.1~1.3 mm 喷芯容易限制流量。")

    power_pressure = design.power_based_pressure
    if spec.pressure_bar > power_pressure.max_bar * 1.15:
        warnings.append(
            "按功率和流量反推，你填的压力偏高，这三个参数可能不能同时成立；建议核对铭牌或实测数据。"
        )
    elif spec.pressure_bar < power_pressure.min_bar * 0.70:
        warnings.append(
            "按功率和流量反推，你填的压力偏低，说明当前可能不是机器额定工况，或者压力数据是喷嘴出口压力而非泵端压力。"
        )

    if design.diameter_nominal_mm < 1.0:
        warnings.append("算出来的喷芯偏小，堵塞风险会明显上升，对进水过滤和清洁度要求较高。")
    elif design.diameter_nominal_mm > 1.8:
        warnings.append("算出来的喷芯偏大，通常对应低压/大流量工况，泡沫细腻度可能不如常见 1.1~1.3 mm 配置。")

    return warnings


def calculate_nozzle_design(spec: WasherSpec) -> NozzleDesign:
    validate_positive("功率", spec.power_watts)
    validate_positive("流量", spec.flow_rate_lpm)
    validate_positive("压强", spec.pressure_bar)

    flow_rate_m3s = lpm_to_m3s(spec.flow_rate_lpm)
    supply_pressure_pa = spec.pressure_bar * BAR_TO_PA
    pressure_from_power = estimate_pressure_from_power(spec.power_watts, spec.flow_rate_lpm)

    cd_min, cd_max = DISCHARGE_COEFFICIENT_RANGE
    pressure_ratio_min, pressure_ratio_max = NOZZLE_PRESSURE_RATIO_RANGE
    cd_nominal = (cd_min + cd_max) / 2.0
    pressure_ratio_nominal = (pressure_ratio_min + pressure_ratio_max) / 2.0

    nozzle_dp_min_pa = supply_pressure_pa * pressure_ratio_min
    nozzle_dp_max_pa = supply_pressure_pa * pressure_ratio_max
    nozzle_dp_nominal_pa = supply_pressure_pa * pressure_ratio_nominal

    diameter_min_mm = nozzle_diameter_mm(flow_rate_m3s, nozzle_dp_max_pa, cd_max)
    diameter_nominal_mm = nozzle_diameter_mm(flow_rate_m3s, nozzle_dp_nominal_pa, cd_nominal)
    diameter_max_mm = nozzle_diameter_mm(flow_rate_m3s, nozzle_dp_min_pa, cd_min)

    jet_velocity_min_ms = cd_nominal * math.sqrt(2.0 * nozzle_dp_min_pa / WATER_DENSITY)
    jet_velocity_max_ms = cd_nominal * math.sqrt(2.0 * nozzle_dp_max_pa / WATER_DENSITY)

    hydraulic_power_watts = supply_pressure_pa * flow_rate_m3s
    required_input_power_min_watts = hydraulic_power_watts / PUMP_EFFICIENCY_RANGE[1]
    required_input_power_max_watts = hydraulic_power_watts / PUMP_EFFICIENCY_RANGE[0]

    design = NozzleDesign(
        diameter_min_mm=diameter_min_mm,
        diameter_nominal_mm=diameter_nominal_mm,
        diameter_max_mm=diameter_max_mm,
        closest_standard_mm=closest_standard_size(diameter_nominal_mm),
        nozzle_dp_min_bar=nozzle_dp_min_pa / BAR_TO_PA,
        nozzle_dp_max_bar=nozzle_dp_max_pa / BAR_TO_PA,
        jet_velocity_min_ms=jet_velocity_min_ms,
        jet_velocity_max_ms=jet_velocity_max_ms,
        hydraulic_power_watts=hydraulic_power_watts,
        required_input_power_min_watts=required_input_power_min_watts,
        required_input_power_max_watts=required_input_power_max_watts,
        power_based_pressure=pressure_from_power,
    )
    design.warnings = build_warnings(spec, design)
    return design


def build_selection_advice(design: NozzleDesign) -> list[str]:
    return [
        f"想要更浓泡沫，可优先靠近区间下限 {design.diameter_min_mm:.2f} mm；吸气更猛，但对压力更挑。",
        f"想要更稳妥通用，可先试标称值 {design.diameter_nominal_mm:.2f} mm，最接近常用标准件 {design.closest_standard_mm:.2f} mm。",
        f"想要更大过水量、减少憋压，可靠近区间上限 {design.diameter_max_mm:.2f} mm；但泡沫通常会更稀。",
    ]


def format_results(spec: WasherSpec, design: NozzleDesign) -> str:
    lines: list[str] = []
    lines.append("=" * 68)
    lines.append("泡沫壶喷芯直径估算结果")
    lines.append("=" * 68)
    lines.append("")

    lines.append("【输入参数】")
    lines.append(f"  洗车机功率： {spec.power_watts:.0f} W")
    lines.append(f"  额定流量：   {spec.flow_rate_lpm:.2f} L/min")
    lines.append(f"  工作压力：   {spec.pressure_bar:.1f} bar" + ("（按功率+流量估算）" if spec.pressure_is_estimated else ""))
    lines.append("")

    lines.append("【喷芯推荐范围】")
    lines.append(f"  合理下限：   {design.diameter_min_mm:.2f} mm")
    lines.append(f"  标称推荐：   {design.diameter_nominal_mm:.2f} mm")
    lines.append(f"  合理上限：   {design.diameter_max_mm:.2f} mm")
    lines.append(f"  就近标准件： {design.closest_standard_mm:.2f} mm")
    lines.append("")

    lines.append("【计算依据】")
    lines.append(
        f"  喷芯有效压差：约 {design.nozzle_dp_min_bar:.1f} ~ {design.nozzle_dp_max_bar:.1f} bar"
    )
    lines.append(
        f"  喷芯等效流速：约 {design.jet_velocity_min_ms:.1f} ~ {design.jet_velocity_max_ms:.1f} m/s"
    )
    lines.append(f"  当前液压功率：约 {design.hydraulic_power_watts:.0f} W")
    lines.append(
        f"  若要支撑该流量和压力，输入功率通常至少要 {design.required_input_power_min_watts:.0f} ~ {design.required_input_power_max_watts:.0f} W"
    )
    lines.append("")

    lines.append("【功率反推压力校验】")
    lines.append(
        f"  以 {spec.power_watts:.0f} W 和 {spec.flow_rate_lpm:.2f} L/min 反推，合理压力大致在 "
        f"{design.power_based_pressure.min_bar:.1f} ~ {design.power_based_pressure.max_bar:.1f} bar"
    )
    lines.append("")

    lines.append("【选型建议】")
    for advice in build_selection_advice(design):
        lines.append(f"  - {advice}")
    lines.append("")

    lines.append("【模型假设】")
    lines.append("  - 把喷芯视为薄壁孔口，基于 Q = Cd * A * sqrt(2ΔP/ρ) 反推直径。")
    lines.append("  - 排出系数 Cd 按 0.68 ~ 0.82 取值。")
    lines.append("  - 假设喷芯可利用的压差约占整机工作压力的 80% ~ 100%。")
    lines.append("  - 本结果适合做喷芯初选，不替代实测；泡沫效果还受洗车液、滤网、混合腔和进气结构影响。")
    lines.append("")

    if design.warnings:
        lines.append("【注意】")
        for warning in design.warnings:
            lines.append(f"  - {warning}")
        lines.append("")

    lines.append("=" * 68)
    return "\n".join(lines)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="根据洗车机参数估算泡沫壶喷芯直径范围")
    parser.add_argument("--power", type=float, help="洗车机输入功率，单位 W")
    parser.add_argument("--flow", type=float, help="洗车机额定流量，单位 L/min")
    parser.add_argument("--pressure", type=float, help="洗车机工作压力，单位 bar；不填则按功率和流量估算")
    return parser.parse_args()


def prompt_float(prompt_text: str, allow_empty: bool = False) -> Optional[float]:
    while True:
        try:
            raw = input(prompt_text).strip()
            if not raw and allow_empty:
                return None
            value = float(raw)
            if value <= 0:
                print("请输入大于 0 的数值。")
                continue
            return value
        except ValueError:
            print("请输入有效数字。")


def collect_inputs() -> WasherSpec:
    args = parse_args()

    if args.power is not None or args.flow is not None or args.pressure is not None:
        if args.power is None or args.flow is None:
            raise ValueError("使用命令行参数时，至少要同时提供 --power 和 --flow；--pressure 可选。")
        power = args.power
        flow = args.flow
        pressure = args.pressure
    else:
        print("=" * 68)
        print("泡沫壶喷芯直径计算工具")
        print("=" * 68)
        print("")
        power = prompt_float("请输入洗车机功率（W，例如 1500）：")
        flow = prompt_float("请输入额定流量（L/min，例如 8）：")
        pressure = prompt_float("请输入工作压力（bar，例如 100；留空则自动估算）：", allow_empty=True)

    assert power is not None and flow is not None

    if pressure is None:
        pressure_estimate = estimate_pressure_from_power(power, flow)
        pressure = pressure_estimate.nominal_bar
        pressure_is_estimated = True
    else:
        pressure_is_estimated = False

    return WasherSpec(
        power_watts=power,
        flow_rate_lpm=flow,
        pressure_bar=pressure,
        pressure_is_estimated=pressure_is_estimated,
    )


def main() -> None:
    try:
        spec = collect_inputs()
        design = calculate_nozzle_design(spec)
        print("")
        print(format_results(spec, design))
    except KeyboardInterrupt:
        print("\n已取消")
        sys.exit(130)
    except ValueError as exc:
        print(f"错误：{exc}")
        sys.exit(1)


if __name__ == "__main__":
    main()
