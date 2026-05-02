'use client'

import { useCallback, useState } from "react";

function useClientRect() {
    const [rect, setRect] = useState(null);
    const ref = useCallback((node: any) => {
        if (node !== null) {
            setRect(node.getBoundingClientRect());
        }
    }, []);
    return [rect, ref];
}