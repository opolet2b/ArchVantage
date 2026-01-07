import { useState, useMemo } from 'react';

type SortDirection = 'ascending' | 'descending' | null;

interface SortConfig {
    key: string;
    direction: SortDirection;
}

export const useSortableData = <T>(items: T[], config: SortConfig = { key: '', direction: null }) => {
    const [sortConfig, setSortConfig] = useState<SortConfig>(config);

    const sortedItems = useMemo(() => {
        const sortableItems = [...items];
        if (sortConfig.key !== '' && sortConfig.direction !== null) {
            sortableItems.sort((a: any, b: any) => {
                const aValue = a[sortConfig.key];
                const bValue = b[sortConfig.key];

                if (aValue < bValue) {
                    return sortConfig.direction === 'ascending' ? -1 : 1;
                }
                if (aValue > bValue) {
                    return sortConfig.direction === 'ascending' ? 1 : -1;
                }
                return 0;
            });
        }
        return sortableItems;
    }, [items, sortConfig]);

    const requestSort = (key: string) => {
        let direction: SortDirection = 'ascending';
        if (
            sortConfig.key === key &&
            sortConfig.direction === 'ascending'
        ) {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    return { items: sortedItems, requestSort, sortConfig };
};
