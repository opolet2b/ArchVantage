"use client";

import { SpaceViewer } from "@/components/spaces/space-viewer";
import { useParams } from "next/navigation";

export default function SpaceViewPage() {
    const params = useParams();
    const id = params.id as string;

    return <SpaceViewer spaceId={id} />;
}
