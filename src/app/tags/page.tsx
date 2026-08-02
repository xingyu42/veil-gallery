import TagsCloud from "@/components/TagsCloud";

export const revalidate = 900;

export default function TagsPage() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="font-serif text-3xl font-bold tracking-wide text-foreground">
        全部标签
      </h1>
      <TagsCloud />
    </div>
  );
}
