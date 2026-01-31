'use client';

import * as React from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface SearchableSelectProps {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Select...",
  disabled = false,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const containerRef = React.useRef<HTMLDivElement>(null);

  const filteredOptions = options.filter((option) =>
    option.label.toLowerCase().includes(search.toLowerCase())
  );

  const selectedLabel = options.find((o) => o.value === value)?.label || placeholder;

  // Click outside to close
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative w-full" ref={containerRef}>
      <Button
        variant="outline"
        role="combobox"
        aria-expanded={open}
        className="w-full justify-between"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>
      {open && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover text-popover-foreground shadow-md ring-1 ring-black ring-opacity-5 focus:outline-none">
            <div className="sticky top-0 z-10 bg-popover p-2">
                <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input 
                        placeholder="Search..." 
                        value={search} 
                        onChange={(e) => setSearch(e.target.value)} 
                        className="pl-8"
                        autoFocus
                    />
                </div>
            </div>
            <div className="p-1">
                {filteredOptions.length === 0 ? (
                    <div className="relative cursor-default select-none py-2 px-4 text-sm text-muted-foreground">
                        No results found.
                    </div>
                ) : (
                    filteredOptions.map((option) => (
                        <div
                            key={option.value}
                            className={cn(
                                "relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
                                value === option.value && "bg-accent text-accent-foreground"
                            )}
                            onClick={() => {
                                onChange(option.value);
                                setOpen(false);
                                setSearch("");
                            }}
                        >
                            <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                                {value === option.value && <Check className="h-4 w-4" />}
                            </span>
                            <span>{option.label}</span>
                        </div>
                    ))
                )}
            </div>
        </div>
      )}
    </div>
  );
}
