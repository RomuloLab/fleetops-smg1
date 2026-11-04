import { notFound } from "next/navigation";
import StelaVoiceQa from "@/app/components/stela-voice-qa";
export const dynamic="force-dynamic";
export default function Page(){if(!import.meta.env.DEV)notFound();return <StelaVoiceQa/>;}
