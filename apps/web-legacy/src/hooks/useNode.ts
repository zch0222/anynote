'use client'

import { useCallback, useState } from "react";

export default function useNode() {
    const [node, setNode] = useState(null);
    const ref = useCallback((node: any) => {
        if (node !== null) {
            setNode(node);
        }
    }, []);
    return [node, ref];
}