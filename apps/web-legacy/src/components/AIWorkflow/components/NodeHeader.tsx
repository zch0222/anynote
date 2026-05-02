import { CardHeader } from "@nextui-org/react";

export default function NodeHeader({title, description}: {
    title: string;
    description: string
}) {

    return (
        <CardHeader className="flex flex-col items-start mr-2">
            <div className="text-xl font-bold">{title}</div>
            <div className="text-sm text-gray-400 mt-2">{description}</div>
        </CardHeader>
    )

}