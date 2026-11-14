import { Apple, Bone, BookOpen, Brain, Bug, Eye, HeartPulse, Microscope, PawPrint, ScanLine, Scissors, Siren, Stethoscope, Syringe, type LucideIcon } from "lucide-react";
import { CATEGORY_LABEL, type CategoryKey } from "@/lib/briefing/schema";

/** 분야 아이콘 (색이 아니라 모양+글자로 구분) */
const CATEGORY_ICON: Record<CategoryKey, LucideIcon> = {
  dermatology: PawPrint,
  ophthalmology: Eye,
  surgery: Scissors,
  internal: Stethoscope,
  oncology: Microscope,
  cardiology: HeartPulse,
  neurology: Brain,
  imaging: ScanLine,
  dentistry: Bone,
  emergency: Siren,
  anesthesia: Syringe,
  infectious: Bug,
  nutrition: Apple,
  etc: BookOpen,
};

/** 분야 이름과 아이콘. 서버·클라이언트 어디서든 부를 수 있다 */
export function categoryInfo(category: string | null): { label: string; Icon: LucideIcon } {
  const key = category && category in CATEGORY_LABEL ? (category as CategoryKey) : null;
  return { label: key ? CATEGORY_LABEL[key].ko : "분야 미지정", Icon: key ? CATEGORY_ICON[key] : BookOpen };
}
